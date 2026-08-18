import "server-only";
/**
 * Object storage behind an adapter.
 *
 * Public vehicle photos and restricted KYC documents use SEPARATE prefixes so
 * that a future bucket policy can lock the KYC prefix down without touching
 * the public one. Keys are random: never derive a key from a person's name,
 * plate or document number.
 */
import { randomUUID, createHash } from "node:crypto";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { dirname, resolve, normalize } from "node:path";
import { config } from "@/lib/config";

export type Bucket = "public-media" | "restricted-kyc";

export interface StoredObject {
  key: string;
  checksum: string;
  sizeBytes: number;
  mimeType: string;
}

export interface StorageAdapter {
  readonly name: string;
  put(bucket: Bucket, body: Buffer, mimeType: string): Promise<StoredObject>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
  /** Short-lived URL. Restricted objects must never be served from a public path. */
  signedUrl(key: string, ttlSeconds?: number): Promise<string>;
}

const ALLOWED_MIME = new Set([
  "image/jpeg", "image/png", "image/webp", "application/pdf",
]);
const MAX_BYTES = 12 * 1024 * 1024;

export class UploadRejectedError extends Error {
  constructor(message: string) { super(message); this.name = "UploadRejectedError"; }
}

export function assertUploadAllowed(mimeType: string, sizeBytes: number): void {
  if (!ALLOWED_MIME.has(mimeType)) {
    throw new UploadRejectedError(`File type ${mimeType} is not accepted. Use JPEG, PNG, WebP or PDF.`);
  }
  if (sizeBytes > MAX_BYTES) {
    throw new UploadRejectedError(`File is larger than ${MAX_BYTES / 1024 / 1024} MB.`);
  }
  if (sizeBytes <= 0) throw new UploadRejectedError("File is empty.");
}

const ROOT = resolve(process.cwd(), ".storage");

/** Local filesystem adapter for development. Not for production use. */
export const localStorage: StorageAdapter = {
  name: "local",
  async put(bucket, body, mimeType) {
    assertUploadAllowed(mimeType, body.byteLength);
    const ext = mimeType === "application/pdf" ? "pdf" : mimeType.split("/")[1];
    const key = `${bucket}/${new Date().getFullYear()}/${randomUUID()}.${ext}`;
    const path = resolve(ROOT, key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
    return {
      key,
      checksum: createHash("sha256").update(body).digest("hex"),
      sizeBytes: body.byteLength,
      mimeType,
    };
  },
  async get(key) {
    return readFile(safePath(key));
  },
  async remove(key) {
    await unlink(safePath(key)).catch(() => {});
  },
  async signedUrl(key) {
    // Development only: the route handler re-checks authorisation server-side.
    return `/api/files/${encodeURIComponent(key)}`;
  },
};

/** Refuse any key that tries to escape the storage root. */
function safePath(key: string): string {
  const path = resolve(ROOT, normalize(key));
  if (!path.startsWith(ROOT)) throw new Error("Invalid storage key.");
  return path;
}

const s3NotImplemented: StorageAdapter = {
  name: "s3",
  async put() { throw new Error("S3 adapter not implemented. Set STORAGE_DRIVER=local for development."); },
  async get() { throw new Error("S3 adapter not implemented."); },
  async remove() { throw new Error("S3 adapter not implemented."); },
  async signedUrl() { throw new Error("S3 adapter not implemented."); },
};

export function getStorage(): StorageAdapter {
  return config.storage.driver === "local" ? localStorage : s3NotImplemented;
}

/** Document numbers are hashed, never stored in the clear. */
export function hashDocumentNumber(value: string): string {
  return createHash("sha256")
    .update(value.replace(/\s+/g, "").toUpperCase())
    .digest("hex");
}
