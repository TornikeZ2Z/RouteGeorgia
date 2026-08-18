import { requireUser } from "@/lib/auth/session";
import { sql } from "@db/client";
import { formatMoney } from "@/lib/money";
import { driverBalance, driverStatement } from "@/lib/ledger";
import { Alert, Card, EmptyState, PageHeader, Table } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Earnings() {
  const user = await requireUser();
  const [driver] = await sql<{ id: string }[]>`SELECT id FROM driver_profiles WHERE user_id = ${user.id}::uuid`;
  if (!driver) return <EmptyState title="Create your driver profile first" />;

  const [balance, statement, payouts, totals] = await Promise.all([
    driverBalance(driver.id),
    driverStatement(driver.id, 60),
    sql<{ id: string; period_start: string; period_end: string; amount_minor: string; state: string; reference: string | null }[]>`
      SELECT id, period_start::text, period_end::text, amount_minor::text, state::text, reference
      FROM payouts WHERE driver_id = ${driver.id}::uuid ORDER BY period_end DESC LIMIT 24`,
    sql<{ trips: number; gross: string; commission: string; net: string }[]>`
      SELECT count(*)::int AS trips,
             coalesce(sum(gross_minor),0)::text AS gross,
             coalesce(sum(commission_minor),0)::text AS commission,
             coalesce(sum(driver_net_minor),0)::text AS net
      FROM bookings WHERE driver_id = ${driver.id}::uuid AND status IN ('COMPLETED','CLOSED')`,
  ]);
  const t = totals[0];

  return (
    <div className="space-y-6">
      <PageHeader title="Earnings" description="Every entry comes from the ledger, not from a running total." />

      {balance.cashBlocked && (
        <Alert tone="danger" title="Cash bookings paused">
          {balance.blockedReason}. Settle {formatMoney(balance.owedToPlatformMinor, "GEL")} to resume.
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-sm text-ink-500">Completed trips</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{t?.trips ?? 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-ink-500">Total fares</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formatMoney(BigInt(t?.gross ?? "0"), "GEL")}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-ink-500">Your share</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formatMoney(BigInt(t?.net ?? "0"), "GEL")}</p>
          <p className="mt-1 text-xs text-ink-500">after 15% commission</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-ink-500">Commission you owe</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formatMoney(balance.owedToPlatformMinor, "GEL")}</p>
          <p className="mt-1 text-xs text-ink-500">
            limit {formatMoney(balance.creditLimitMinor, "GEL")}
          </p>
        </Card>
      </div>

      <Alert tone="info" title="How cash and card differ">
        On a card trip we collect the fare and owe you 85%. On a cash trip you keep the whole fare at
        the roadside and owe us the 15% commission — that debt is what the figure above tracks.
      </Alert>

      <section>
        <h2 className="mb-2 font-semibold text-ink-900">Payouts</h2>
        {payouts.length === 0 ? (
          <p className="text-sm text-ink-600">
            No payouts yet. Card-paid trips build up as a balance we owe you; cash trips you keep at
            the roadside and settle the commission separately.
          </p>
        ) : (
          <Table head={["Period", "Amount", "State", "Reference"]}>
            {payouts.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-2.5 text-xs">{p.period_start} → {p.period_end}</td>
                <td className="px-4 py-2.5 tabular-nums">{formatMoney(BigInt(p.amount_minor), "GEL")}</td>
                <td className="px-4 py-2.5 text-xs">{p.state.toLowerCase()}</td>
                <td className="px-4 py-2.5 font-mono text-xs">{p.reference ?? "—"}</td>
              </tr>
            ))}
          </Table>
        )}
      </section>

      {statement.length === 0 ? (
        <EmptyState title="No ledger entries yet">Complete a trip and it will appear here.</EmptyState>
      ) : (
        <Table head={["Date", "Booking", "Description", "Account", "Amount"]}>
          {statement.map((line, i) => (
            <tr key={i}>
              <td className="px-4 py-2.5 whitespace-nowrap text-xs">{new Date(line.at).toLocaleDateString()}</td>
              <td className="px-4 py-2.5 font-mono text-xs">{line.bookingCode ?? "—"}</td>
              <td className="px-4 py-2.5 text-ink-700">{line.memo}</td>
              <td className="px-4 py-2.5 text-xs text-ink-500">{line.account.replaceAll("_", " ").toLowerCase()}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">
                {line.side === "DEBIT" ? "+" : "−"}{formatMoney(line.amountMinor, "GEL")}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
