import "server-only";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import type { Minor } from "@/lib/money";
import { config } from "@/lib/config";

/**
 * Card payments behind an adapter.
 *
 * The platform never sees a card number. A provider session is created, the
 * traveller completes payment on the provider's hosted page, and the result
 * arrives as a signed webhook that we process idempotently.
 *
 * The bundled "sandbox" provider implements the same contract without any
 * external account, so the whole booking-and-refund flow is testable today.
 * Replace it with a Georgian acquiring bank or an NBG-regulated provider
 * before taking real money — see DECISIONS.md.
 */
export interface CheckoutSession {
  providerRef: string;
  /** Where to send the traveller to complete payment. */
  redirectUrl: string;
  expiresAt: Date;
}

export interface RefundResult {
  providerRef: string;
  state: "SUCCEEDED" | "PENDING" | "FAILED";
}

export interface WebhookEvent {
  id: string;
  type: "payment.succeeded" | "payment.failed" | "refund.succeeded" | "unknown";
  providerRef: string;
  amountMinor: Minor;
  currency: string;
  raw: Record<string, unknown>;
}

export interface PaymentProvider {
  readonly name: string;
  createCheckout(input: {
    bookingCode: string;
    amountMinor: Minor;
    currency: string;
    customerEmail: string;
    returnUrl: string;
  }): Promise<CheckoutSession>;
  refund(input: { providerRef: string; amountMinor: Minor; currency: string; idempotencyKey: string }): Promise<RefundResult>;
  verifyAndParse(rawBody: string, signature: string | null): WebhookEvent;
}

/** Shared secret for the sandbox provider's webhook signature. */
const SANDBOX_SECRET = createHash("sha256").update(config.sessionSecret).digest("hex");

export function signSandboxPayload(body: string): string {
  return createHash("sha256").update(`${SANDBOX_SECRET}.${body}`).digest("hex");
}

const sandbox: PaymentProvider = {
  name: "sandbox",

  async createCheckout({ bookingCode, amountMinor, currency, returnUrl }) {
    const providerRef = `sbx_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
    const params = new URLSearchParams({
      ref: providerRef, code: bookingCode,
      amount: amountMinor.toString(), currency, returnUrl,
    });
    return {
      providerRef,
      // A local page that stands in for the bank's hosted form.
      redirectUrl: `/checkout/sandbox?${params}`,
      expiresAt: new Date(Date.now() + 30 * 60_000),
    };
  },

  async refund({ providerRef, amountMinor }) {
    // A real provider is asynchronous; the sandbox settles immediately.
    return { providerRef: `${providerRef}_rf_${amountMinor}`, state: "SUCCEEDED" };
  },

  verifyAndParse(rawBody, signature) {
    if (!signature) throw new WebhookSignatureError("Missing signature header.");
    const expected = signSandboxPayload(rawBody);
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new WebhookSignatureError("Signature does not match.");
    }
    const parsed = JSON.parse(rawBody) as {
      id?: string; type?: string; ref?: string; amount?: string; currency?: string;
    };
    if (!parsed.id || !parsed.ref) throw new WebhookSignatureError("Malformed event.");

    const type: WebhookEvent["type"] =
      parsed.type === "payment.succeeded" || parsed.type === "payment.failed" ||
      parsed.type === "refund.succeeded" ? parsed.type : "unknown";

    return {
      id: parsed.id,
      type,
      providerRef: parsed.ref,
      amountMinor: BigInt(parsed.amount ?? "0"),
      currency: parsed.currency ?? "GEL",
      raw: parsed as Record<string, unknown>,
    };
  },
};

export class WebhookSignatureError extends Error {
  constructor(message: string) { super(message); this.name = "WebhookSignatureError"; }
}

export function getPaymentProvider(): PaymentProvider {
  return sandbox;
}
