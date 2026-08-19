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

  ROUTING_PROVIDER: z.enum(["haversine", "google", "mapbox"]).default("haversine"),
  ROUTING_API_KEY: z.string().default(""),
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  /** Shown in the header and footer once the business SIM exists. Hidden when empty. */
  SUPPORT_PHONE: z.string().default(""),
  SUPPORT_EMAIL: z.string().default("support@routegeorgia.ge"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

const parsed = Schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`Invalid environment configuration:\n${issues}\n\nCopy .env.example to .env and fill it in.`);
}

const env = parsed.data;

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
  routing: { provider: env.ROUTING_PROVIDER, apiKey: env.ROUTING_API_KEY },
  storage: { driver: env.STORAGE_DRIVER },
} as const;

export type AppConfig = typeof config;
