import { Card } from "@/components/ui";
import { SandboxControls } from "./controls";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false }, title: "Card payment" };

/**
 * Stand-in for the acquiring bank's hosted payment page.
 *
 * A real provider hosts this, collects the card, and calls our webhook. This
 * page exists so the entire booking-payment-confirmation-refund path can be
 * exercised end to end without a merchant account, and so the swap to a real
 * provider is a change of adapter rather than a change of flow.
 */
export default async function SandboxCheckout({
  searchParams,
}: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const amount = Number(sp.amount ?? 0) / 100;

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4">
      <Card className="p-6">
        <p className="text-xs font-medium uppercase tracking-wide text-gold-700">
          Test payment page
        </p>
        <h1 className="mt-1 text-xl font-semibold text-ink-900">
          {amount.toFixed(2)} {sp.currency ?? "GEL"}
        </h1>
        <p className="mt-1 text-sm text-ink-600">Booking {sp.code}</p>

        <div className="mt-4 rounded-lg bg-gold-50 p-3 text-sm text-gold-700">
          This stands in for your bank's payment page. No real card is involved and no money moves.
          Choose an outcome to test the flow.
        </div>

        <SandboxControls
          providerRef={sp.ref ?? ""}
          amountMinor={sp.amount ?? "0"}
          currency={sp.currency ?? "GEL"}
          returnUrl={sp.returnUrl ?? "/"}
        />
      </Card>
    </div>
  );
}
