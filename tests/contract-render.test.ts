/**
 * The agreements as they actually render, against a real database.
 *
 * The unit tests cover the shape of the seeded text; this covers the join
 * between that text and the values substituted into it. The failure it exists
 * to catch is a legal document going in front of a counterparty with
 * "{{DRIVER_PERSONAL_NUMBER}}" printed in the middle of it.
 *
 * Skips cleanly when no database is reachable, like the other integration
 * tests here.
 */
import { describe, it, expect, beforeAll } from "vitest";
import postgres from "postgres";

// config reads the environment once, at module load, so the company details
// have to exist before anything imports it.
process.env.COMPANY_LEGAL_NAME ||= 'შპს "რაუტ ჯორჯია"';
process.env.COMPANY_ID_NUMBER ||= "437377704";
process.env.COMPANY_ADDRESS ||= "თბილისი, საქართველო";
process.env.COMPANY_DIRECTOR ||= "Test Director";

const probe = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {}, connect_timeout: 3 });

let reachable = false;
try {
  const rows = await probe<{ n: number }[]>`
    SELECT count(*)::int AS n FROM contract_versions WHERE published`;
  reachable = (rows[0]?.n ?? 0) > 0;
  if (!reachable) console.warn("[contract-render] No published agreement — run db:migrate. Skipping.");
} catch {
  console.warn("[contract-render] No database reachable. Skipping.");
} finally {
  await probe.end();
}

const DRIVER = {
  name: "სანდრო ავსაჯანიშვილი",
  personalNumber: "01001000001",
  phone: "995555123456",
  address: "თბილისი, რუსთაველის 1",
};

const SCHOOL = {
  name: "Tbilisi Public School 51",
  idNumber: "205123456",
  director: "Nino Beridze",
  address: "Tbilisi",
  phone: "995322000000",
};

describe.skipIf(!reachable)("agreements as rendered", () => {
  let contract: typeof import("@/lib/contract");

  beforeAll(async () => {
    contract = await import("@/lib/contract");
  });

  it("leaves no placeholder syntax in the driver agreement", async () => {
    for (const locale of ["ka", "en", "ru"]) {
      const doc = await contract.getActiveContract(locale, "DRIVER", DRIVER);
      expect(doc, `no driver agreement for ${locale}`).not.toBeNull();
      expect(doc!.body.match(/\{\{[A-Z_]+\}\}/g)).toBeNull();
    }
  });

  it("leaves no placeholder syntax in the school agreement", async () => {
    for (const locale of ["ka", "en"]) {
      const doc = await contract.getSchoolAgreement(locale, SCHOOL);
      expect(doc, `no school agreement for ${locale}`).not.toBeNull();
      expect(doc!.body.match(/\{\{[A-Z_]+\}\}/g)).toBeNull();
    }
  });

  it("names the driver personally, in both languages", async () => {
    for (const locale of ["ka", "en"]) {
      const doc = await contract.getActiveContract(locale, "DRIVER", DRIVER);
      expect(doc!.body).toContain(DRIVER.personalNumber);
      expect(doc!.body).toContain(DRIVER.address);
    }
  });

  it("substitutes the commission actually in force", async () => {
    const doc = await contract.getActiveContract("en", "DRIVER", DRIVER);
    const clause = doc!.body.match(/6\.2\.[^\n]*/)?.[0] ?? "";
    // Whatever the rate is, the two shares must be stated and add to 100.
    const [platform, driver] = [...clause.matchAll(/(\d+(?:\.\d+)?)%/g)].map((m) => Number(m[1]));
    expect(platform).toBeDefined();
    expect(platform! + driver!).toBe(100);
  });

  it("renders a blank template when nobody is named, and a different one", async () => {
    const template = await contract.getActiveContract("ka", "DRIVER");
    const personal = await contract.getActiveContract("ka", "DRIVER", DRIVER);
    expect(template!.isTemplate).toBe(true);
    expect(personal!.isTemplate).toBe(false);
    // The hash is what a signature commits to; a template must never share it
    // with a real driver's copy.
    expect(template!.bodyHash).not.toBe(personal!.bodyHash);
    expect(template!.body).toContain("____________");
  });

  it("gives two different drivers two different documents", async () => {
    const a = await contract.getActiveContract("ka", "DRIVER", DRIVER);
    const b = await contract.getActiveContract("ka", "DRIVER", {
      ...DRIVER, personalNumber: "02002000002",
    });
    expect(a!.bodyHash).not.toBe(b!.bodyHash);
  });
});
