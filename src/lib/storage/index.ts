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
import {
  S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
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

/**
 * Object keys are random and carry no meaning.
 *
 * Never derive a key from a person's name, plate or document number: object
 * keys leak into logs, backups and error reports, and a key like
 * "restricted-kyc/2026/giorgi-kapanadze-passport.jpg" is a disclosure all by
 * itself. The bucket prefix is the only structure here, and it exists so a
 * bucket policy can lock the KYC prefix down separately.
 */
export function objectKey(bucket: Bucket, mimeType: string): string {
  const ext = mimeType === "application/pdf" ? "pdf" : mimeType.split("/")[1];
  return `${bucket}/${new Date().getFullYear()}/${randomUUID()}.${ext}`;
}

/** The prefix a key must sit under to be treated as that bucket's object. */
export const isInBucket = (key: string, bucket: Bucket): boolean =>
  key.startsWith(`${bucket}/`);

/** Local filesystem adapter for development. Not for production use. */
export const localStorage: StorageAdapter = {
  name: "local",
  async put(bucket, body, mimeType) {
    assertUploadAllowed(mimeType, body.byteLength);
    const key = objectKey(bucket, mimeType);
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
    // Development only, and deliberately NOT a bare file path: restricted
    // objects are served by /api/admin/documents/[id], which re-checks the
    // permission and writes an audit entry. Public media has its own route.
    if (!isInBucket(key, "public-media")) {
      throw new Error("Restricted objects are served through the audited admin route, not a URL.");
    }
    return `/api/media/${key.split("/").map(encodeURIComponent).join("/")}`;
  },
};

/** Refuse any key that tries to escape the storage root. */
function safePath(key: string): string {
  const path = resolve(ROOT, normalize(key));
  if (!path.startsWith(ROOT)) throw new Error("Invalid storage key.");
  return path;
}

/**
 * S3-compatible object storage: Cloudflare R2, AWS S3, Backblaze B2.
 *
 * One bucket, two prefixes. Public vehicle photographs and restricted KYC
 * documents are separated by prefix rather than by bucket so that a single
 * set of credentials manages both, while a bucket policy can still deny
 * public access to everything under restricted-kyc/ — which is the whole
 * reason the prefixes exist.
 *
 * Nothing here is served from the bucket directly. Both routes stream through
 * the application, so the site keeps its strict `img-src 'self'` policy, KYC
 * access stays audited, and the bucket itself can remain entirely private.
 */
let client: S3Client | null = null;

function s3(): S3Client {
  // Built once and reused. Constructing a client per request leaks sockets
  // under load and re-resolves credentials every time.
  client ??= new S3Client({
    region: config.storage.region,
    // Cloudflare R2 needs an explicit endpoint; AWS S3 derives one from the
    // region, so an empty value must mean "work it out" rather than "".
    //
    // With a custom endpoint the bucket goes in the path rather than the
    // hostname: R2, MinIO and Backblaze all accept that, and virtual-hosted
    // style against a bare host would try to resolve "<bucket>.<host>". AWS
    // has deprecated path style for new buckets, so it is applied only when
    // an endpoint is set — which never happens for AWS.
    ...(config.storage.endpoint
      ? { endpoint: config.storage.endpoint, forcePathStyle: true }
      : {}),
    credentials: {
      accessKeyId: config.storage.accessKeyId,
      secretAccessKey: config.storage.secretAccessKey,
    },
    // R2 rejects the streaming checksum trailers newer SDKs add by default.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return client;
}

export const s3Storage: StorageAdapter = {
  name: "s3",

  async put(bucket, body, mimeType) {
    assertUploadAllowed(mimeType, body.byteLength);
    const key = objectKey(bucket, mimeType);
    const checksum = createHash("sha256").update(body).digest("hex");

    await s3().send(new PutObjectCommand({
      Bucket: config.storage.bucket,
      Key: key,
      Body: body,
      ContentType: mimeType,
      // Read back later to detect a corrupted or substituted object.
      Metadata: { sha256: checksum },
    }));

    return { key, checksum, sizeBytes: body.byteLength, mimeType };
  },

  async get(key) {
    const result = await s3().send(new GetObjectCommand({
      Bucket: config.storage.bucket,
      Key: key,
    }));
    const bytes = await result.Body?.transformToByteArray();
    if (!bytes) throw new Error("Object has no body.");
    return Buffer.from(bytes);
  },

  async remove(key) {
    await s3().send(new DeleteObjectCommand({
      Bucket: config.storage.bucket,
      Key: key,
    }));
  },

  async signedUrl(key, ttlSeconds = 300) {
    // Restricted objects are never handed out as a URL. A presigned link is
    // bearer access: whoever holds it can read the document, it survives in
    // browser history and chat apps, and nothing records that it was used.
    // Reviewers open KYC through /api/admin/documents/[id], which checks the
    // permission and writes an audit entry for every single view.
    if (!isInBucket(key, "public-media")) {
      throw new Error("Restricted objects are served through the audited admin route, not a signed URL.");
    }
    return getSignedUrl(
      s3(),
      new GetObjectCommand({ Bucket: config.storage.bucket, Key: key }),
      { expiresIn: ttlSeconds },
    );
  },
};

export function getStorage(): StorageAdapter {
  return config.storage.driver === "local" ? localStorage : s3Storage;
}

/** Document numbers are hashed, never stored in the clear. */
export function hashDocumentNumber(value: string): string {
  return createHash("sha256")
    .update(value.replace(/\s+/g, "").toUpperCase())
    .digest("hex");
}
