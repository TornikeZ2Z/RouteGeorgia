/**
 * Test bootstrap. Loads .env when present, then fills in safe defaults so
 * pure-logic tests (money, pricing, RBAC, routing) run without a database or
 * any configuration at all.
 */
import { config as loadEnv } from "dotenv";
loadEnv();

/**
 * Tests NEVER use DATABASE_URL.
 *
 * The integration tests in tests/db.test.ts are not read-only: they insert and
 * delete availability blocks, and they write an audit row that the append-only
 * trigger then makes permanent. `.env` on a developer's machine usually points
 * at the hosted database the live site reads from, and `npm run ship` runs the
 * whole suite before every deploy — so the default had every deploy writing
 * test data to production, including one undeletable audit entry each time.
 *
 * Point TEST_DATABASE_URL at a database you are happy to have written to. With
 * it unset the database tests skip cleanly, exactly as they do when no
 * Postgres is running, and the pure-logic tests still run.
 */
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://app:app@127.0.0.1:55432/routegeorgia";

process.env.SESSION_SECRET ??= "test-secret-value-not-used-for-anything-real";
process.env.APP_URL ??= "http://localhost:3000";
