import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { signSandboxPayload } from "@/lib/payments";
import { config } from "@/lib/config";

/**
 * Development helper: signs a sandbox event and posts it to the real webhook
 * route, so the test payment page exercises the genuine verification and
 * idempotency path rather than a shortcut. Disabled in production.
 */
export async function POST(request: NextRequest) {
  if (config.isProduction) {
    return NextResponse.json({ error: "not available" }, { status: 404 });
  }

  const input = (await request.json()) as Record<string, unknown>;
  const body = JSON.stringify({ id: randomUUID(), ...input });

  const response = await fetch(new URL("/api/webhooks/payments/sandbox", config.appUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-signature": signSandboxPayload(body) },
    body,
  });

  return NextResponse.json({ ok: response.ok }, { status: response.ok ? 200 : 502 });
}
