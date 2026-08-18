import { requireUser } from "@/lib/auth/session";
import { getTranslator, isLocale, type Locale } from "@/lib/i18n";
import { sql } from "@db/client";
import { formatMoney } from "@/lib/money";
import { driverBalance, driverStatement } from "@/lib/ledger";
import { Alert, Card, EmptyState, PageHeader, Table } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Earnings() {
  const user = await requireUser();
  const t = getTranslator(isLocale(user.locale) ? (user.locale as Locale) : "ka");
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
  const sums = totals[0];

  return (
    <div className="space-y-6">
      <PageHeader title={t("console.earningsTitle")} description={t("console.earningsDesc")} />

      {balance.cashBlocked && (
        <Alert tone="danger" title={t("console.cashBlockedT")}>
          {t("console.cashBlockedB", { amount: formatMoney(balance.owedToPlatformMinor, "GEL") })}
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-sm text-ink-500">{t("console.completedTrips")}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{sums?.trips ?? 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-ink-500">{t("console.totalFares")}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formatMoney(BigInt(sums?.gross ?? "0"), "GEL")}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-ink-500">{t("console.yourShare")}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formatMoney(BigInt(sums?.net ?? "0"), "GEL")}</p>
          <p className="mt-1 text-xs text-ink-500">{t("console.afterCommission")}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-ink-500">{t("console.commissionOwed")}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formatMoney(balance.owedToPlatformMinor, "GEL")}</p>
          <p className="mt-1 text-xs text-ink-500">
            {t("console.limit", { amount: formatMoney(balance.creditLimitMinor, "GEL") })}
          </p>
        </Card>
      </div>

      <Alert tone="info" title={t("console.cashCardT")}>
        {t("console.cashCardB")}
      </Alert>

      <section>
        <h2 className="mb-2 font-semibold text-ink-900">{t("console.payoutsT")}</h2>
        {payouts.length === 0 ? (
          <p className="text-sm text-ink-600">
            {t("console.payoutsNone")}
          </p>
        ) : (
          <Table head={[t("console.colPeriod"), t("console.colAmount"), t("console.colState"), t("console.colReference")]}>
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
        <EmptyState title={t("console.ledgerT")}>{t("console.ledgerNone")}</EmptyState>
      ) : (
        <Table head={[t("console.colDate"), t("console.colBooking"), t("console.colDescription"), t("console.colAccount"), t("console.colAmount")]}>
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
