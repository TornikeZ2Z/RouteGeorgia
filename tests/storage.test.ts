/**
 * Object storage.
 *
 * Driver documents are passports and driving licences. The rules that matter
 * are about where an object goes, what its key gives away, and who can be
 * handed a link to it — not about the S3 protocol itself, which the SDK owns.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  objectKey, isInBucket, assertUploadAllowed, UploadRejectedError,
  hashDocumentNumber, localStorage, s3Storage,
} from "@/lib/storage";

describe("object keys", () => {
  it("puts each bucket under its own prefix", () => {
    expect(objectKey("restricted-kyc", "image/jpeg")).toMatch(/^restricted-kyc\//);
    expect(objectKey("public-media", "image/jpeg")).toMatch(/^public-media\//);
  });

  /**
   * Keys reach logs, backups and error reports. A key built from a name or a
   * document number would be a disclosure on its own.
   */
  it("is random and carries nothing about the person", () => {
    const a = objectKey("restricted-kyc", "image/jpeg");
    const b = objectKey("restricted-kyc", "image/jpeg");
    expect(a).not.toBe(b);
    expect(a).toMatch(/^restricted-kyc\/\d{4}\/[0-9a-f-]{36}\.jpeg$/);
  });

  it("keeps a usable extension for each accepted type", () => {
    expect(objectKey("public-media", "image/png")).toMatch(/\.png$/);
    expect(objectKey("public-media", "image/webp")).toMatch(/\.webp$/);
    expect(objectKey("restricted-kyc", "application/pdf")).toMatch(/\.pdf$/);
  });

  it("does not mistake one prefix for another", () => {
    expect(isInBucket("public-media/2026/x.jpg", "public-media")).toBe(true);
    expect(isInBucket("restricted-kyc/2026/x.jpg", "public-media")).toBe(false);
    // A key that merely starts with the same letters is not inside the bucket.
    expect(isInBucket("public-media-evil/2026/x.jpg", "public-media")).toBe(false);
  });
});

describe("signed URLs", () => {
  /**
   * A presigned link is bearer access: whoever holds it can read the document,
   * it survives in browser history and chat apps, and nothing records that it
   * was used. Reviewers open KYC through the audited admin route instead.
   */
  it("refuses to hand out a link to a KYC object", async () => {
    await expect(s3Storage.signedUrl("restricted-kyc/2026/secret.pdf")).rejects.toThrow(/audited/i);
    await expect(localStorage.signedUrl("restricted-kyc/2026/secret.pdf")).rejects.toThrow(/audited/i);
  });

  it("allows one for public vehicle media", async () => {
    await expect(localStorage.signedUrl("public-media/2026/car.jpg"))
      .resolves.toBe("/api/media/public-media/2026/car.jpg");
  });
});

describe("upload limits", () => {
  it("accepts the formats a phone camera and a scanner produce", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp", "application/pdf"]) {
      expect(() => assertUploadAllowed(type, 1024)).not.toThrow();
    }
  });

  it("refuses anything else, including files disguised by name", () => {
    expect(() => assertUploadAllowed("image/tiff", 1024)).toThrow(UploadRejectedError);
    expect(() => assertUploadAllowed("application/x-msdownload", 1024)).toThrow(UploadRejectedError);
    expect(() => assertUploadAllowed("text/html", 1024)).toThrow(UploadRejectedError);
  });

  it("refuses an empty file and one over the limit", () => {
    expect(() => assertUploadAllowed("image/jpeg", 0)).toThrow(UploadRejectedError);
    expect(() => assertUploadAllowed("image/jpeg", 13 * 1024 * 1024)).toThrow(UploadRejectedError);
    expect(() => assertUploadAllowed("image/jpeg", 12 * 1024 * 1024)).not.toThrow();
  });
});

describe("document numbers", () => {
  it("is a one-way hash, not the number", () => {
    const hash = hashDocumentNumber("01001 234567");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain("234567");
  });

  it("matches the same number written differently", () => {
    expect(hashDocumentNumber("ab 123 456")).toBe(hashDocumentNumber("AB123456"));
  });

  it("does not collide across different numbers", () => {
    expect(hashDocumentNumber("AB123456")).not.toBe(hashDocumentNumber("AB123457"));
  });
});

describe("configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  /**
   * The previous adapter threw on first use, so a misconfigured deployment
   * looked healthy and then lost a driver's application halfway through
   * submitting it. A missing bucket is a deployment mistake and should stop
   * the deployment.
   */
  it("refuses to start when s3 is selected without credentials", async () => {
    vi.resetModules();
    vi.stubEnv("STORAGE_DRIVER", "s3");
    vi.stubEnv("S3_BUCKET", "");
    vi.stubEnv("S3_ACCESS_KEY_ID", "");
    vi.stubEnv("S3_SECRET_ACCESS_KEY", "");
    await expect(import("@/lib/config")).rejects.toThrow(/S3_BUCKET/);
  });

  it("starts when the credentials are present", async () => {
    vi.resetModules();
    vi.stubEnv("STORAGE_DRIVER", "s3");
    vi.stubEnv("S3_BUCKET", "routegeorgia-files");
    vi.stubEnv("S3_ACCESS_KEY_ID", "test-key-id");
    vi.stubEnv("S3_SECRET_ACCESS_KEY", "test-secret");
    const { config } = await import("@/lib/config");
    expect(config.storage.driver).toBe("s3");
    expect(config.storage.bucket).toBe("routegeorgia-files");
  });
});
