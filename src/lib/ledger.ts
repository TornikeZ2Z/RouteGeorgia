import "server-only";
import { randomUUID } from "node:crypto";
import type { Sql, TransactionSql } from "postgres";
import { sql as rootSql } from "@db/client";
import type { Minor } from "@/lib/money";

/**
 * Double-entry ledger.
 *
 * Balances are NEVER derived from mutable booking rows. Every movement of
 * money is a posting group of two or more entries that must sum to zero, and
 * the database enforces that with a deferred constraint trigger. Entries are
 * append-only; a mistake is corrected with a reversing posting, not an UPDATE.
 *
 * Sign convention: for the accounts we care about, a DEBIT increases what is
 * owed TO us or held BY us, and a CREDIT increases what we owe out.
 */
export type AccountKind =
  | "CARD_CLEARING"     // money the payment provider holds for us
  | "CASH_WITH_DRIVER"  // fare the driver collected directly from the traveller
  | "PLATFORM_CASH"     // money we actually hold, e.g. settled commission
  | "PLATFORM_REVENUE"  // commission, earned
  | "DRIVER_PAYABLE"    // we owe the driver, from card trips
  | "DRIVER_RECEIVABLE" // the driver owes us commission, from cash trips
  | "REFUNDS"
  | "PAYOUTS";

export interface PostingLine {
  account: AccountKind;
  /** Required for DRIVER_PAYABLE and DRIVER_RECEIVABLE, ignored otherwise. */
  driverId?: string | null;
  side: "DEBIT" | "CREDIT";
  amountMinor: Minor;
  memo: string;
}

type Executor = Sql | TransactionSql;

const DRIVER_SCOPED: ReadonlySet<AccountKind> = new Set(["DRIVER_PAYABLE", "DRIVER_RECEIVABLE"]);

async function accountId(tx: Executor, kind: AccountKind, driverId: string | null, currency = "GEL"): Promise<string> {
  const scoped = DRIVER_SCOPED.has(kind);
  if (scoped && !driverId) throw new Error(`${kind} requires a driverId`);
  const owner = scoped ? driverId : null;

  const existing = await tx<{ id: string }[]>`
    SELECT id FROM ledger_accounts
    WHERE kind = ${kind}::account_kind AND currency = ${currency}
      AND driver_id IS NOT DISTINCT FROM ${owner}::uuid`;
  if (existing[0]) return existing[0].id;

  const [created] = await tx<{ id: string }[]>`
    INSERT INTO ledger_accounts (kind, driver_id, currency)
    VALUES (${kind}::account_kind, ${owner}::uuid, ${currency})
    ON CONFLICT DO NOTHING
    RETURNING id`;
  if (created) return created.id;

  const [again] = await tx<{ id: string }[]>`
    SELECT id FROM ledger_accounts
    WHERE kind = ${kind}::account_kind AND currency = ${currency}
      AND driver_id IS NOT DISTINCT FROM ${owner}::uuid`;
  return again!.id;
}

/**
 * Write one balanced posting group. Must run inside the same transaction as
 * the business change it records, so money and state can never diverge.
 */
export async function post(
  tx: Executor,
  lines: PostingLine[],
  context: { bookingId?: string | null; paymentId?: string | null; currency?: string } = {},
): Promise<string> {
  if (lines.length < 2) throw new Error("A posting needs at least two lines.");

  const currency = context.currency ?? "GEL";
  const debits = lines.filter((l) => l.side === "DEBIT").reduce((a, l) => a + l.amountMinor, 0n);
  const credits = lines.filter((l) => l.side === "CREDIT").reduce((a, l) => a + l.amountMinor, 0n);
  if (debits !== credits) {
    throw new Error(`Unbalanced posting: debits ${debits}, credits ${credits}`);
  }

  const group = randomUUID();
  for (const line of lines) {
    if (line.amountMinor <= 0n) continue; // a zero line carries no meaning
    const account = await accountId(tx, line.account, line.driverId ?? null, currency);
    await tx`
      INSERT INTO ledger_entries (posting_group, account_id, side, amount_minor, currency,
                                  booking_id, payment_id, memo)
      VALUES (${group}::uuid, ${account}::uuid, ${line.side}::ledger_side,
              ${line.amountMinor.toString()}::bigint, ${currency},
              ${context.bookingId ?? null}::uuid, ${context.paymentId ?? null}::uuid, ${line.memo})`;
  }
  return group;
}

export interface DriverBalance {
  /** Commission the driver owes us from cash trips, minus what they have settled. */
  owedToPlatformMinor: Minor;
  /** Net fare we owe the driver from card trips, minus what we have paid out. */
  owedToDriverMinor: Minor;
  creditLimitMinor: Minor;
  /** True when new cash work must be withheld until they settle. */
  cashBlocked: boolean;
  blockedReason: string | null;
}

export async function driverBalance(driverId: string, executor: Executor = rootSql): Promise<DriverBalance> {
  const [row] = await executor<{
    receivable: string; payable: string; credit_limit_minor: string | null;
    blocked_at: Date | null; blocked_reason: string | null;
  }[]>`
    SELECT
      coalesce((SELECT sum(CASE WHEN e.side='DEBIT' THEN e.amount_minor ELSE -e.amount_minor END)
                FROM ledger_entries e JOIN ledger_accounts a ON a.id = e.account_id
                WHERE a.kind='DRIVER_RECEIVABLE' AND a.driver_id = ${driverId}::uuid), 0)::text AS receivable,
      coalesce((SELECT sum(CASE WHEN e.side='CREDIT' THEN e.amount_minor ELSE -e.amount_minor END)
                FROM ledger_entries e JOIN ledger_accounts a ON a.id = e.account_id
                WHERE a.kind='DRIVER_PAYABLE' AND a.driver_id = ${driverId}::uuid), 0)::text AS payable,
      w.credit_limit_minor::text, w.blocked_at, w.blocked_reason
    FROM (SELECT 1) x
    LEFT JOIN driver_wallets w ON w.driver_id = ${driverId}::uuid`;

  const owed = BigInt(row?.receivable ?? "0");
  const limit = BigInt(row?.credit_limit_minor ?? "20000");
  const manuallyBlocked = Boolean(row?.blocked_at);

  return {
    owedToPlatformMinor: owed,
    owedToDriverMinor: BigInt(row?.payable ?? "0"),
    creditLimitMinor: limit,
    cashBlocked: manuallyBlocked || owed > limit,
    blockedReason: manuallyBlocked
      ? (row?.blocked_reason ?? "Blocked by operations")
      : owed > limit
        ? "Unpaid commission is over the credit limit"
        : null,
  };
}

/** Driver IDs that must not be offered new cash work. */
export async function cashBlockedDriverIds(executor: Executor = rootSql): Promise<Set<string>> {
  const rows = await executor<{ driver_id: string }[]>`
    SELECT a.driver_id,
           coalesce(sum(CASE WHEN e.side='DEBIT' THEN e.amount_minor ELSE -e.amount_minor END), 0) AS owed,
           coalesce(max(w.credit_limit_minor), 20000) AS limit_minor,
           bool_or(w.blocked_at IS NOT NULL) AS blocked
    FROM ledger_accounts a
    LEFT JOIN ledger_entries e ON e.account_id = a.id
    LEFT JOIN driver_wallets w ON w.driver_id = a.driver_id
    WHERE a.kind = 'DRIVER_RECEIVABLE' AND a.driver_id IS NOT NULL
    GROUP BY a.driver_id
    HAVING bool_or(w.blocked_at IS NOT NULL)
        OR coalesce(sum(CASE WHEN e.side='DEBIT' THEN e.amount_minor ELSE -e.amount_minor END), 0)
           > coalesce(max(w.credit_limit_minor), 20000)`;
  return new Set(rows.map((r) => r.driver_id));
}

export interface StatementLine {
  at: Date;
  memo: string;
  bookingCode: string | null;
  side: "DEBIT" | "CREDIT";
  amountMinor: Minor;
  account: AccountKind;
}

export async function driverStatement(driverId: string, limit = 100): Promise<StatementLine[]> {
  const rows = await rootSql<{
    created_at: Date; memo: string; code: string | null; side: "DEBIT" | "CREDIT";
    amount_minor: string; kind: AccountKind;
  }[]>`
    SELECT e.created_at, e.memo, b.code, e.side, e.amount_minor::text, a.kind
    FROM ledger_entries e
    JOIN ledger_accounts a ON a.id = e.account_id
    LEFT JOIN bookings b ON b.id = e.booking_id
    WHERE a.driver_id = ${driverId}::uuid
    ORDER BY e.created_at DESC
    LIMIT ${limit}`;
  return rows.map((r) => ({
    at: r.created_at, memo: r.memo, bookingCode: r.code, side: r.side,
    amountMinor: BigInt(r.amount_minor), account: r.kind,
  }));
}

/** Whole-ledger integrity check, run by the reconciliation test and admin page. */
export async function ledgerIsBalanced(executor: Executor = rootSql): Promise<{ balanced: boolean; groups: number; drift: string }> {
  const [row] = await executor<{ groups: string; drift: string }[]>`
    SELECT count(*)::text AS groups,
           coalesce(sum(net), 0)::text AS drift
    FROM (
      SELECT posting_group,
             sum(CASE WHEN side='DEBIT' THEN amount_minor ELSE -amount_minor END) AS net
      FROM ledger_entries GROUP BY posting_group
    ) g`;
  return {
    balanced: BigInt(row?.drift ?? "0") === 0n,
    groups: Number(row?.groups ?? 0),
    drift: row?.drift ?? "0",
  };
}
