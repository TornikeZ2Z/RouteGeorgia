import "server-only";
import { headers } from "next/headers";
import { config } from "@/lib/config";

/**
 * Request-level protections for endpoints that change something.
 *
 * Next.js protects server actions against cross-site posts automatically, but
 * plain route handlers get nothing. Sign-in, checkout and preferences are all
 * route handlers — chosen deliberately so they work without JavaScript — so
 * they have to check for themselves.
 */

export class CrossOriginError extends Error {
  constructor() {
    super("This request did not come from our site.");
    this.name = "CrossOriginError";
  }
}

/**
 * Reject writes initiated by another site.
 *
 * Browsers always send Origin on cross-origin POSTs, and send it on same-origin
 * POSTs too. A request with no Origin and no Referer is a plain HTTP client
 * rather than a browser, which is allowed — that is how curl and the payment
 * provider's webhook reach us.
 */
export async function assertSameOrigin(): Promise<void> {
  const h = await headers();
  const origin = h.get("origin");
  const referer = h.get("referer");
  if (!origin && !referer) return;

  const expected = new URL(config.appUrl).host;
  const forwarded = h.get("x-forwarded-host") ?? h.get("host");

  const allowed = new Set(
    [expected, forwarded, "routegeorgia.ge", "www.routegeorgia.ge"].filter(Boolean) as string[],
  );

  const sourceHost = (() => {
    try { return new URL(origin ?? referer!).host; } catch { return null; }
  })();

  if (!sourceHost || !allowed.has(sourceHost)) throw new CrossOriginError();
}

/**
 * In-memory fixed-window rate limiter.
 *
 * Deliberately simple and per-process. On a single instance that is exactly
 * right; behind several it becomes per-instance, which still blunts a brute
 * force by the instance count. Moving to Redis is a change of this file only.
 */
interface Window { count: number; resetAt: number }
const windows = new Map<string, Window>();

export interface RateLimit {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function rateLimit(key: string, limit: number, windowSeconds: number): RateLimit {
  const now = Date.now();
  const existing = windows.get(key);

  if (!existing || existing.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    // Opportunistic cleanup so the map cannot grow without bound.
    if (windows.size > 5000) {
      for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
    }
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  const allowed = existing.count <= limit;
  return {
    allowed,
    remaining: Math.max(0, limit - existing.count),
    retryAfterSeconds: allowed ? 0 : Math.ceil((existing.resetAt - now) / 1000),
  };
}

/** Best-effort client identity for rate limiting. */
export async function clientKey(scope: string): Promise<string> {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    "unknown";
  return `${scope}:${ip}`;
}

/**
 * 303 See Other with a *relative* Location (valid per RFC 9110 §10.2.2).
 * The browser resolves it against the URL it actually requested, so redirects
 * work identically on localhost, 127.0.0.1, previews and production without
 * the server ever guessing its own host. (`request.url` in route handlers
 * reports the internal hostname, not the one the visitor used.)
 */
export function seeOther(
  pathAndQuery: string,
  headers?: Record<string, string>,
): Response {
  return new Response(null, {
    status: 303,
    headers: { Location: pathAndQuery, ...headers },
  });
}
