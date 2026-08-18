"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

export function SandboxControls({
  providerRef, amountMinor, currency, returnUrl,
}: { providerRef: string; amountMinor: string; currency: string; returnUrl: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function settle(outcome: "payment.succeeded" | "payment.failed") {
    setBusy(outcome);
    setError(null);
    try {
      const response = await fetch("/api/webhooks/payments/sandbox/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: outcome, ref: providerRef, amount: amountMinor, currency }),
      });
      if (!response.ok) throw new Error(await response.text());
      router.push(outcome === "payment.succeeded" ? returnUrl : `${returnUrl}&payment=failed`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(null);
    }
  }

  return (
    <div className="mt-6 space-y-3">
      <Button className="w-full" disabled={busy !== null} onClick={() => settle("payment.succeeded")}>
        {busy === "payment.succeeded" ? "Processing…" : "Simulate successful payment"}
      </Button>
      <Button variant="secondary" className="w-full" disabled={busy !== null} onClick={() => settle("payment.failed")}>
        {busy === "payment.failed" ? "Processing…" : "Simulate declined card"}
      </Button>
      {error && <p className="text-sm text-[--color-danger]" role="alert">{error}</p>}
    </div>
  );
}
