/**
 * Test bootstrap. Loads .env when present, then fills in safe defaults so
 * pure-logic tests (money, pricing, RBAC, routing) run without a database or
 * any configuration at all.
 */
import { config as loadEnv } from "dotenv";
loadEnv();

// NODE_ENV is read-only in Next.js type definitions; vitest already sets it.
process.env.DATABASE_URL ??= "postgres://app:app@127.0.0.1:55432/gotrip";
process.env.SESSION_SECRET ??= "test-secret-value-not-used-for-anything-real";
process.env.APP_URL ??= "http://localhost:3000";
