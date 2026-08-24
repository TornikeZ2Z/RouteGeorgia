import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { sql } from "@db/client";
import { formatMoney } from "@/lib/money";
import { ledgerIsBalanced } from "@/lib/ledger";
import { Alert, Badge, Card, EmptyState, PageHeader, Table } from "@/components/ui";
import { adminT } from "@/lib/i18n/admin";

export const dynamic = "force-dynamic";

/**
 * The finance view.
 *
 * Every figure here is summed from ledger entries, never from booking rows.
 * If the two ever disagree, the ledger is right — that is the whole point of
 * keeping one.
 */
export default async function Finance() {
  const staffUser = await requirePermission("admin.finance.read");
  const t = adminT(staffUser.locale);

  const [balances, owing, recent, integrity, refunds] = await Promise.all([
    sql<{ kind: string; net: string }[]>`
      SELECT a.kind::text AS kind,
             coalesce(sum(CASE WHEN e.side='DEBIT' THEN e.amount_minor ELSE -e.amount_minor END), 0)::text AS net
      FROM ledger_accounts a LEFT JOIN ledger_entries e ON e.account_id = a.id
      GROUP BY a.kind ORDER BY a.kind`,
    sql<{ driver_id: string; public_name: string; owed: string; limit_minor: string; blocked: boolean }[]>`
      SELECT a.driver_id, d.public_name,
             sum(CASE WHEN e.side='DEBIT' THEN e.amount_minor ELSE -e.amount_minor END)::text AS owed,
             coalesce(max(w.credit_limit_minor), 20000)::text AS limit_minor,
             bool_or(w.blocked_at IS NOT NULL) AS blocked
      FROM ledger_accounts a
      JOIN ledger_entries e ON e.account_id = a.id
      JOIN driver_profiles d ON d.id = a.driver_id
      LEFT JOIN driver_wallets w ON w.driver_id = a.driver_id
      WHERE a.kind = 'DRIVER_RECEIVABLE'
      GROUP BY a.driver_id, d.public_name
      HAVING sum(CASE WHEN e.side='DEBIT' THEN e.amount_minor ELSE -e.amount_minor END) > 0
      ORDER BY 3 DESC LIMIT 40`,
    sql<{ at: Date; memo: string; side: string; amount: string; kind: string; code: string | null }[]>`
      SELECT e.created_at AS at, e.memo, e.side::text, e.amount_minor::text AS amount,
             a.kind::text AS kind, b.code
      FROM ledger_entries e
      JOIN ledger_accounts a ON a.id = e.account_id
      LEFT JOIN bookings b ON b.id = e.booking_id
      ORDER BY e.created_at DESC LIMIT 40`,
    ledgerIsBalanced(),
    sql<{ n: number; total: string }[]>`
      SELECT count(*)::int AS n, coalesce(sum(amount_minor), 0)::text AS total
      FROM payments WHERE kind = 'REFUND' AND state = 'SUCCEEDED'`,
  ]);

  const value = (kind: string) =>
    BigInt(balances.find((b) => b.kind === kind)?.net ?? "0");

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("page.finance")}
        description={t("page.financeDetail")}
      />

      {integrity.balanced ? (
        <Alert tone="success" title="The ledger balances">
          All {integrity.groups} posting group(s) sum to zero.
        </Alert>
      ) : (
        <Alert tone="danger" title="The ledger does not balance">
          Drift of {integrity.drift} across {integrity.groups} posting group(s). Stop and investigate
          before trusting any figure on this page.
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-sm text-ink-500">Commission earned</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {formatMoney(-value("PLATFORM_REVENUE"), "GEL")}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-ink-500">Owed to us by drivers</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {formatMoney(value("DRIVER_RECEIVABLE"), "GEL")}
          </p>
          <p className="mt-1 text-xs text-ink-500">unsettled cash commission</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-ink-500">We owe drivers</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {formatMoney(-value("DRIVER_PAYABLE"), "GEL")}
          </p>
          <p className="mt-1 text-xs text-ink-500">from card trips</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-ink-500">Refunded</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {formatMoney(BigInt(refunds[0]?.total ?? "0"), "GEL")}
          </p>
          <p className="mt-1 text-xs text-ink-500">{refunds[0]?.n ?? 0} refund(s)</p>
        </Card>
      </div>

      <section>
        <h2 className="mb-2 font-semibold text-ink-900">Drivers with unsettled commission</h2>
        {owing.length === 0 ? (
          <EmptyState title="No driver owes commission right now" />
        ) : (
          <Table head={["Driver", "Owed", "Credit limit", "Status", ""]}>
            {owing.map((d) => {
              const owed = BigInt(d.owed);
              const limit = BigInt(d.limit_minor);
              const over = owed > limit || d.blocked;
              return (
                <tr key={d.driver_id}>
                  <td className="px-4 py-2.5 font-medium">{d.public_name}</td>
                  <td className="px-4 py-2.5 tabular-nums">{formatMoney(owed, "GEL")}</td>
                  <td className="px-4 py-2.5 tabular-nums">{formatMoney(limit, "GEL")}</td>
                  <td className="px-4 py-2.5">
                    <Badge tone={over ? "danger" : "success"}>
                      {over ? "cash work blocked" : "within limit"}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Link href={`/admin/drivers/${d.driver_id}`} className="text-ink-900 underline">
                      Settle
                    </Link>
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-semibold text-ink-900">Account balances</h2>
        <Table head={["Account", "Meaning", "Balance"]}>
          {balances.map((b) => (
            <tr key={b.kind}>
              <td className="px-4 py-2.5 font-mono text-xs">{b.kind.toLowerCase()}</td>
              <td className="px-4 py-2.5 text-xs text-ink-600">{MEANING[b.kind] ?? ""}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{formatMoney(BigInt(b.net), "GEL")}</td>
            </tr>
          ))}
        </Table>
      </section>

      <section>
        <h2 className="mb-2 font-semibold text-ink-900">Recent postings</h2>
        <Table head={["When", "Booking", "Account", "Description", "Amount"]}>
          {recent.map((r, i) => (
            <tr key={i}>
              <td className="px-4 py-2.5 whitespace-nowrap text-xs tabular-nums">
                {new Date(r.at).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}
              </td>
              <td className="px-4 py-2.5 font-mono text-xs">{r.code ?? "—"}</td>
              <td className="px-4 py-2.5 text-xs">{r.kind.toLowerCase()}</td>
              <td className="px-4 py-2.5 text-xs text-ink-600">{r.memo}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">
                {r.side === "DEBIT" ? "+" : "−"}{formatMoney(BigInt(r.amount), "GEL")}
              </td>
            </tr>
          ))}
        </Table>
      </section>
    </div>
  );
}

const MEANING: Record<string, string> = {
  CARD_CLEARING: "held by the payment provider on our behalf",
  CASH_WITH_DRIVER: "fares collected directly by drivers",
  PLATFORM_CASH: "money we actually hold, e.g. settled commission",
  PLATFORM_REVENUE: "commission earned (shown negative: it is a credit)",
  DRIVER_PAYABLE: "what we owe drivers from card trips",
  DRIVER_RECEIVABLE: "what drivers owe us from cash trips",
  REFUNDS: "returned to travellers",
  PAYOUTS: "sent to drivers",
};
