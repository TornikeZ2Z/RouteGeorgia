import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";
import { config } from "@/lib/config";

declare global {
  // eslint-disable-next-line no-var
  var __sql: ReturnType<typeof postgres> | undefined;
}

// One pool per process. Next.js dev reloads modules, so cache on globalThis.
export const sql =
  globalThis.__sql ??
  postgres(config.databaseUrl, {
    max: 10,
    idle_timeout: 20,
    // Money is bigint minor units. Return it as a JS bigint-safe string and
    // convert explicitly — never let it silently become a lossy float.
    types: {
      bigint: {
        to: 20,
        from: [20],
        serialize: (v: bigint | number) => String(v),
        parse: (v: string) => BigInt(v),
      },
    },
  });

if (process.env.NODE_ENV !== "production") globalThis.__sql = sql;

export const db = drizzle(sql, { schema });
export type Db = typeof db;
