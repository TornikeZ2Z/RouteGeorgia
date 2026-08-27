import { z } from "zod";

/**
 * Typed environment configuration. Reading process.env anywhere else in the
 * app is a bug: every value must be declared, validated and documented here.
 */
const intFromEnv = (fallback: number) =>
  z.coerce.number().int().nonnegative().default(fallback);

const Schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required — run `npm run db:start`"),
  APP_URL: z.string().optional(),
  // Vercel supplies these automatically; they let APP_URL default correctly on
  // preview deployments without anyone having to set it per branch.
  VERCEL_PROJECT_PRODUCTION_URL: z.string().optional(),
  VERCEL_URL: z.string().optional(),
  RENDER_EXTERNAL_URL: z.string().optional(),
  SESSION_SECRET: z.string().min(16, "SESSION_SECRET must be at least 16 characters"),

  COMMISSION_RATE_BPS: intFromEnv(1500),
  CANONICAL_CURRENCY: z.string().default("GEL"),
  PRICE_ROUNDING_STEP_MINOR: intFromEnv(50),
  QUOTE_TTL_SECONDS: intFromEnv(900),
  HOLD_TTL_SECONDS: intFromEnv(600),
  DRIVER_ACK_SLA_MINUTES: intFromEnv(10),
  CHILD_SEAT_FEE_MINOR: intFromEnv(2000),

  /**
   * "osrm" uses the public OSRM demo server — real road distances, free, no
   * key — and silently falls back to the haversine estimate if it is slow or
   * down, so a quote never fails because a free service hiccuped. Swap to
   * google/mapbox when volume justifies a paid, SLA-backed provider.
   */
  ROUTING_PROVIDER: z.enum(["haversine", "osrm", "google", "mapbox"]).default("osrm"),
  ROUTING_API_KEY: z.string().default(""),
  /**
   * Where uploaded files live.
   *
   * "local" writes to the server's own disk and is for development only: on a
   * container host the filesystem is discarded on every deploy, which for a
   * KYC bucket means a driver's passport disappears the next time anyone ships
   * a change. Production must be "s3".
   *
   * "s3" is any S3-compatible object store — Cloudflare R2, AWS S3, Backblaze
   * B2. R2 is the cheaper fit here: no egress charge, and the documents are
   * streamed through the app rather than served from the bucket.
   */
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  S3_BUCKET: z.string().default(""),
  /** R2: https://<account-id>.r2.cloudflarestorage.com — omit for AWS S3. */
  S3_ENDPOINT: z.string().default(""),
  /** R2 ignores this but the protocol requires one; "auto" is correct there. */
  S3_REGION: z.string().default("auto"),
  S3_ACCESS_KEY_ID: z.string().default(""),
  S3_SECRET_ACCESS_KEY: z.string().default(""),
  /** Shown in the header and footer once the business SIM exists. Hidden when empty. */
  SUPPORT_PHONE: z.string().default(""),
  SUPPORT_EMAIL: z.string().default("support@routeplanner.ge"),

  /**
   * The contracting entity, as it must appear in the driver agreement.
   *
   * Empty until the company is registered. The agreement refuses to publish
   * while any of these is blank — a driver must never be asked to sign a
   * contract whose counterparty reads "to be completed".
   */
  /**
   * Transactional email. Without a key the outbox still records every
   * message and the dispatcher still runs — it just prints to the server log
   * instead of sending, which is the development behaviour.
   */
  RESEND_API_KEY: z.string().default(""),
  /**
   * SMTP, for Google Workspace and anything else that speaks it. Takes
   * precedence over Resend when a host, user and password are all present.
   */
  SMTP_HOST: z.string().default(""),
  SMTP_PORT: z.coerce.number().int().positive().default(465),
  SMTP_USER: z.string().default(""),
  SMTP_PASSWORD: z.string().default(""),
  /** Must be an address on a domain verified with the provider. */
  MAIL_FROM: z.string().default("Route Planner <noreply@routeplanner.ge>"),

  COMPANY_LEGAL_NAME: z.string().default(""),
  COMPANY_ID_NUMBER: z.string().default(""),
  COMPANY_ADDRESS: z.string().default(""),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

const parsed = Schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`Invalid environment configuration:\n${issues}\n\nCopy .env.example to .env and fill it in.`);
}

const env = parsed.data;

/**
 * Refuse to start rather than fail at upload time.
 *
 * The old S3 adapter threw when it was first called, which meant a
 * misconfigured deployment looked healthy and then lost a driver's
 * application halfway through submitting it. A missing bucket name is a
 * deployment mistake; it should stop the deployment, not a driver.
 */
if (env.STORAGE_DRIVER === "s3") {
  const missing = (
    [
      ["S3_BUCKET", env.S3_BUCKET],
      ["S3_ACCESS_KEY_ID", env.S3_ACCESS_KEY_ID],
      ["S3_SECRET_ACCESS_KEY", env.S3_SECRET_ACCESS_KEY],
    ] as const
  ).filter(([, value]) => !value.trim()).map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(
      `STORAGE_DRIVER is "s3" but ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} not set.\n` +
      `Set them, or use STORAGE_DRIVER=local for development.`,
    );
  }
}

/**
 * Local disk in production is data loss waiting for the next deploy. Say so
 * loudly; do not stop the process, because an existing deployment that is
 * merely serving pages should not be taken down by this.
 */
if (env.STORAGE_DRIVER === "local" && env.NODE_ENV === "production") {
  console.error(
    "[storage] STORAGE_DRIVER=local in production. Uploaded driver documents " +
    "are written to this container's disk and WILL BE LOST on the next deploy. " +
    "Set STORAGE_DRIVER=s3 with S3_BUCKET, S3_ENDPOINT and credentials.",
  );
}

/**
 * Absolute base URL.
 *
 * Used for canonical tags, hreflang alternates, links in transactional email
 * and payment return URLs, so it must be the address the traveller actually
 * sees. Getting this wrong means Google indexes the hosting subdomain instead
 * of the real domain, and confirmation emails link somewhere unfamiliar.
 *
 * Order: an explicit APP_URL always wins; otherwise fall back to whatever the
 * host tells us, so preview deploys still produce working links.
 */
function resolveAppUrl(): string {
  if (env.APP_URL) return env.APP_URL.replace(/\/$/, "");
  if (env.RENDER_EXTERNAL_URL) return env.RENDER_EXTERNAL_URL.replace(/\/$/, "");
  if (env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export const config = {
  databaseUrl: env.DATABASE_URL,
  appUrl: resolveAppUrl(),
  sessionSecret: env.SESSION_SECRET,
  isProduction: env.NODE_ENV === "production",

  /** Marketplace policy — see DECISIONS.md before changing any of these. */
  policy: {
    commissionRateBps: env.COMMISSION_RATE_BPS,
    currency: env.CANONICAL_CURRENCY,
    roundingStepMinor: env.PRICE_ROUNDING_STEP_MINOR,
    quoteTtlSeconds: env.QUOTE_TTL_SECONDS,
    holdTtlSeconds: env.HOLD_TTL_SECONDS,
    driverAckSlaMinutes: env.DRIVER_ACK_SLA_MINUTES,
    childSeatFeeMinor: env.CHILD_SEAT_FEE_MINOR,
    /** Version stamped onto every booking so history survives policy edits. */
    version: "policy-2026-08-v1",
  },

  contact: { phone: env.SUPPORT_PHONE, email: env.SUPPORT_EMAIL },
  mail: {
    resendApiKey: env.RESEND_API_KEY,
    from: env.MAIL_FROM,
    smtp: {
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      user: env.SMTP_USER,
      password: env.SMTP_PASSWORD,
    },
  },
  company: {
    legalName: env.COMPANY_LEGAL_NAME,
    idNumber: env.COMPANY_ID_NUMBER,
    address: env.COMPANY_ADDRESS,
  },
  routing: { provider: env.ROUTING_PROVIDER, apiKey: env.ROUTING_API_KEY },
  storage: {
    driver: env.STORAGE_DRIVER,
    bucket: env.S3_BUCKET,
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  },
} as const;

export type AppConfig = typeof config;
