/**
 * The S3 adapter, against a server that impersonates an S3 endpoint.
 *
 * This is the closest thing to a real upload that runs without a bucket, a
 * network or credentials: a local HTTP server captures exactly what the
 * adapter sends. It catches the things that actually break an object store
 * integration — wrong addressing style, a missing content type, a body that
 * never arrives — rather than re-testing the AWS SDK's own signing.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import type { StorageAdapter } from "@/lib/storage";

interface Captured {
  method: string;
  url: string;
  authorization: string;
  contentType: string;
  sha256Meta: string;
  bodyBytes: number;
}

const captured: Captured[] = [];
let server: http.Server;
let storage: StorageAdapter;

const PAYLOAD = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      captured.push({
        method: req.method ?? "",
        url: req.url ?? "",
        authorization: String(req.headers.authorization ?? ""),
        contentType: String(req.headers["content-type"] ?? ""),
        sha256Meta: String(req.headers["x-amz-meta-sha256"] ?? ""),
        bodyBytes: Buffer.concat(chunks).length,
      });
      if (req.method === "GET") {
        res.writeHead(200, { "Content-Type": "image/jpeg" });
        res.end(PAYLOAD);
      } else {
        res.writeHead(200, { ETag: '"abc"' });
        res.end();
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  vi.resetModules();
  vi.stubEnv("STORAGE_DRIVER", "s3");
  vi.stubEnv("S3_BUCKET", "routegeorgia-files");
  vi.stubEnv("S3_REGION", "auto");
  vi.stubEnv("S3_ENDPOINT", `http://127.0.0.1:${port}`);
  vi.stubEnv("S3_ACCESS_KEY_ID", "AKIAEXAMPLEKEYID");
  vi.stubEnv("S3_SECRET_ACCESS_KEY", "example-secret-key-not-real");

  ({ s3Storage: storage } = await import("@/lib/storage"));
});

afterAll(async () => {
  vi.unstubAllEnvs();
  vi.resetModules();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("s3 adapter on the wire", () => {
  it("stores an object and reports its key, size and checksum", async () => {
    const stored = await storage.put("restricted-kyc", PAYLOAD, "image/jpeg");

    expect(stored.key).toMatch(/^restricted-kyc\/\d{4}\/[0-9a-f-]{36}\.jpeg$/);
    expect(stored.sizeBytes).toBe(PAYLOAD.length);
    expect(stored.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.mimeType).toBe("image/jpeg");

    const put = captured.find((c) => c.method === "PUT");
    expect(put, "no PUT reached the endpoint").toBeDefined();
    expect(put!.bodyBytes).toBe(PAYLOAD.length);
    expect(put!.contentType).toBe("image/jpeg");
    // Stored alongside the object so a corrupted or substituted file is
    // detectable later without re-reading the database.
    expect(put!.sha256Meta).toBe(stored.checksum);
  });

  it("signs every request", () => {
    for (const request of captured) {
      expect(request.authorization, `${request.method} was unsigned`)
        .toMatch(/^AWS4-HMAC-SHA256 Credential=AKIAEXAMPLEKEYID/);
    }
  });

  /**
   * With a custom endpoint the bucket belongs in the path. Virtual-hosted
   * style would try to resolve "<bucket>.<host>", which fails against R2's
   * account endpoint, MinIO and anything else self-hosted.
   */
  it("addresses the bucket by path when an endpoint is configured", () => {
    const put = captured.find((c) => c.method === "PUT")!;
    expect(put.url).toMatch(/^\/routegeorgia-files\/restricted-kyc\//);
  });

  it("reads an object back", async () => {
    const stored = await storage.put("public-media", PAYLOAD, "image/jpeg");
    const body = await storage.get(stored.key);
    expect(Buffer.from(body).equals(PAYLOAD)).toBe(true);
  });

  it("deletes an object", async () => {
    const stored = await storage.put("public-media", PAYLOAD, "image/jpeg");
    await storage.remove(stored.key);
    expect(captured.some((c) => c.method === "DELETE" && c.url.includes(stored.key))).toBe(true);
  });

  it("still refuses to sign a URL for a restricted object", async () => {
    await expect(storage.signedUrl("restricted-kyc/2026/passport.pdf")).rejects.toThrow(/audited/i);
  });

  it("signs a URL for public media that carries an expiry", async () => {
    const url = await storage.signedUrl("public-media/2026/car.jpg", 300);
    expect(url).toContain("/routegeorgia-files/public-media/2026/car.jpg");
    expect(url).toContain("X-Amz-Expires=300");
    expect(url).toContain("X-Amz-Signature=");
  });

  it("rejects a file type before it reaches the network", async () => {
    const before = captured.length;
    await expect(storage.put("public-media", PAYLOAD, "image/tiff")).rejects.toThrow(/not accepted/i);
    expect(captured.length, "a rejected upload still hit the endpoint").toBe(before);
  });
});
