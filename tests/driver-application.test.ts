/**
 * Public driver applications.
 *
 * The form is open to anyone with the link, so the checks below are the only
 * thing between a stranger on the internet and a record in the verification
 * queue. Each test here is a rule an operator would otherwise have to catch by
 * reading, on a file that should never have been created.
 */
import { describe, it, expect } from "vitest";
import {
  ApplicationSchema, validateApplication, APPLICATION_ERRORS, isApplicationError,
  DOCUMENT_SLOTS, displayName, inferVehicleClass, transliterate,
  type ApplicationFiles, type ApplicationLanguage,
} from "@/lib/driver-application";
import { en } from "@/lib/i18n/en";
import { ka } from "@/lib/i18n/ka";
import { ru } from "@/lib/i18n/ru";

const iso = (offsetYears: number, offsetDays = 0) => {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() + offsetYears);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};

const photo = (name = "id.jpg") =>
  new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], name, { type: "image/jpeg" });

const FIELDS = {
  locale: "en",
  legalFirstName: "Giorgi",
  legalLastName: "Kapanadze",
  dateOfBirth: iso(-38),
  email: "giorgi@example.com",
  phone: "+995 555 12 34 56",
  baseLocationId: "",
  experienceYears: "12",
  make: "Toyota",
  model: "Land Cruiser Prado",
  year: "2019",
  plate: "AA-123-BB",
  seats: "4",
  luggage: "3",
  consent: "on",
};

const parse = (overrides: Record<string, string> = {}) => {
  const result = ApplicationSchema.safeParse({ ...FIELDS, ...overrides });
  if (!result.success) throw new Error(result.error.issues.map((i) => `${i.path}: ${i.message}`).join("; "));
  return result.data;
};

const files = (over: ApplicationFiles = {}): ApplicationFiles => ({
  identityFile: photo("id.jpg"),
  licenceFile: photo("licence.jpg"),
  ...over,
});

const SPEAKS: ApplicationLanguage[] = [{ language: "en", level: "FLUENT" }];

describe("application schema", () => {
  it("accepts a complete application", () => {
    expect(validateApplication(parse(), files(), SPEAKS)).toEqual([]);
  });

  it("refuses an unticked consent box rather than assuming it", () => {
    const result = ApplicationSchema.safeParse({ ...FIELDS, consent: "" });
    expect(result.success).toBe(false);
  });

  it("refuses a submission with no consent field at all", () => {
    const { consent: _consent, ...withoutConsent } = FIELDS;
    expect(ApplicationSchema.safeParse(withoutConsent).success).toBe(false);
  });

  it("rejects a car older than the fleet policy allows", () => {
    expect(ApplicationSchema.safeParse({ ...FIELDS, year: "1974" }).success).toBe(false);
  });

  it("trims whitespace rather than storing a padded name", () => {
    expect(parse({ legalFirstName: "  Giorgi  " }).legalFirstName).toBe("Giorgi");
  });

  /**
   * The honeypot must PARSE, not fail validation. A filled trap that produced
   * an error page would tell a bot which field it fell into; the route answers
   * with the ordinary thank-you page instead.
   */
  it("accepts a filled honeypot so the caller can answer it silently", () => {
    expect(parse({ website: "https://spam.example" }).website).toBe("https://spam.example");
  });
});

describe("application rules", () => {
  it("turns away anyone under 21", () => {
    expect(validateApplication(parse({ dateOfBirth: iso(-19) }), files(), SPEAKS)).toContain("AGE");
  });

  it("accepts someone who turned 21 today", () => {
    const application = parse({ dateOfBirth: iso(-21), experienceYears: "3" });
    expect(validateApplication(application, files(), SPEAKS)).toEqual([]);
  });

  it("rejects more driving experience than the applicant has had years to acquire", () => {
    const errors = validateApplication(
      parse({ dateOfBirth: iso(-25), experienceYears: "20" }), files(), SPEAKS,
    );
    expect(errors).toContain("EXPERIENCE");
  });

  it("demands identity and licence images", () => {
    const errors = validateApplication(parse(), {}, SPEAKS);
    expect(errors).toContain("IDENTITY_FILE");
    expect(errors).toContain("LICENCE_FILE");
  });

  it("treats an empty file as no file", () => {
    const empty = new File([], "blank.jpg", { type: "image/jpeg" });
    const errors = validateApplication(parse(), files({ identityFile: empty }), SPEAKS);
    expect(errors).toContain("IDENTITY_FILE");
  });

  /**
   * Georgian is recorded for every applicant without being asked, so someone
   * who speaks neither English nor Russian is a normal applicant, not an
   * incomplete one. This used to be a blocking error.
   */
  it("accepts an applicant who ticked no language at all", () => {
    expect(validateApplication(parse(), files(), [])).toEqual([]);
  });

  it("rejects a file type storage would refuse, once, not per file", () => {
    const bad = new File([new Uint8Array([1])], "scan.tiff", { type: "image/tiff" });
    const errors = validateApplication(parse(), files({ identityFile: bad, licenceFile: bad }), SPEAKS);
    expect(errors.filter((e) => e === "FILE_REJECTED")).toHaveLength(1);
  });

  it("asks for identity and licence, and nothing else, to apply", () => {
    expect(DOCUMENT_SLOTS.filter((s) => s.required).map((s) => s.type))
      .toEqual(["IDENTITY", "DRIVING_LICENSE"]);
    expect(DOCUMENT_SLOTS.filter((s) => !s.required).map((s) => s.type))
      .toEqual(["VEHICLE_REGISTRATION"]);
  });

  /**
   * Insurance is still required before a driver can be published and the
   * signed agreement obliges them to hold it — it is simply collected from
   * their documents page rather than blocking the application.
   */
  it("does not ask for insurance at application time", () => {
    expect(DOCUMENT_SLOTS.map((s) => s.type)).not.toContain("INSURANCE");
  });
});

describe("derived fields", () => {
  /** The form stopped asking for these; wrong answers here reach travellers. */
  it("builds the public name from the legal name", () => {
    expect(displayName("Giorgi", "Kapanadze")).toBe("Giorgi K.");
    expect(displayName("  giorgi  ", "  kapanadze  ")).toBe("giorgi K.");
    // Georgian Mkhedruli is unicameral: uppercasing it yields Mtavruli, the
    // all-caps display form, which reads as shouting inside a name.
    expect(displayName("გიორგი", "კაპანაძე")).toBe("გიორგი კ.");
    expect(displayName("Иван", "Беридзе")).toBe("Иван Б.");
  });

  it("does not leave a dangling initial when there is no surname", () => {
    expect(displayName("Giorgi", "")).toBe("Giorgi");
  });

  it("infers the vehicle class from seats and four-wheel drive", () => {
    expect(inferVehicleClass(4, {})).toBe("COMFORT");
    expect(inferVehicleClass(4, { four_wheel_drive: true })).toBe("SUV_4X4");
    expect(inferVehicleClass(7, {})).toBe("MINIVAN");
    expect(inferVehicleClass(16, {})).toBe("MINIBUS");
  });

  /** A 4x4 minibus is a minibus: seats decide the price band first. */
  it("puts seats ahead of four-wheel drive for large vehicles", () => {
    expect(inferVehicleClass(16, { four_wheel_drive: true })).toBe("MINIBUS");
  });

  /**
   * Handles become public URLs. Without transliteration every Georgian name
   * stripped down to nothing and the whole domestic supply shared
   * indistinguishable handles like "driver-7c18".
   */
  it("transliterates Georgian names so handles stay readable", () => {
    expect(transliterate("გიორგი")).toBe("giorgi");
    expect(transliterate("კაპანაძე")).toBe("kapanadze");
    expect(transliterate("ცხრაძე")).toBe("tskhradze");
  });

  it("leaves Latin text alone", () => {
    expect(transliterate("Giorgi K.")).toBe("Giorgi K.");
  });
});

describe("error reporting", () => {
  it("recognises its own codes and nothing else", () => {
    for (const code of APPLICATION_ERRORS) expect(isApplicationError(code)).toBe(true);
    expect(isApplicationError("DROP TABLE users")).toBe(false);
    expect(isApplicationError("")).toBe(false);
  });

  /**
   * A code with no message renders as a blank bullet in a red box — the
   * applicant is told something is wrong and not what.
   */
  it("every code has a message in all three languages", () => {
    for (const code of APPLICATION_ERRORS) {
      const key = `drive.err${code.split("_").map((part) =>
        part[0] + part.slice(1).toLowerCase()).join("")}`;
      expect(Object.keys(en), `${code} → ${key}`).toContain(key);
      expect(Object.keys(ka), `${code} → ${key}`).toContain(key);
      expect(Object.keys(ru), `${code} → ${key}`).toContain(key);
    }
  });
});
