import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { sql } from "@db/client";
import { Alert, Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { adminT } from "@/lib/i18n/admin";
import { OpenTicketForm, TicketActions } from "./forms";

export const dynamic = "force-dynamic";

const SEVERITY: Record<string, { tone: "danger" | "warning" | "info" | "neutral"; label: string }> = {
  SEV1: { tone: "danger",  label: "SEV-1 · safety or data" },
  SEV2: { tone: "warning", label: "SEV-2 · trip at risk" },
  SEV3: { tone: "info",    label: "SEV-3 · single booking" },
  SEV4: { tone: "neutral", label: "SEV-4 · minor" },
};

/**
 * Support tickets.
 *
 * A booking that goes wrong needs an owner and a written record. Without this
 * the only trace of a difficult phone call was whatever the person who took
 * it happened to remember.
 */
export default async function Support() {
  const staffUser = await requirePermission("admin.bookings.read");
  const t = adminT(staffUser.locale);

  const [tickets, notes, bookings] = await Promise.all([
    sql<Row[]>`
      SELECT t.id, t.subject, t.category, t.severity::text AS severity, t.state::text AS state,
             t.created_at, t.resolved_at, t.resolution,
             b.code AS booking_code, b.id AS booking_id,
             o.email AS owner_email
      FROM support_tickets t
      LEFT JOIN bookings b ON b.id = t.booking_id
      LEFT JOIN users o ON o.id = t.owner_id
      ORDER BY
        CASE t.state WHEN 'OPEN' THEN 0 WHEN 'WAITING' THEN 1 ELSE 2 END,
        CASE t.severity WHEN 'SEV1' THEN 0 WHEN 'SEV2' THEN 1 WHEN 'SEV3' THEN 2 ELSE 3 END,
        t.created_at DESC
      LIMIT 100`,
    sql<{ ticket_id: string; body: string; created_at: Date; email: string | null }[]>`
      SELECT n.ticket_id, n.body, n.created_at, u.email
      FROM support_notes n LEFT JOIN users u ON u.id = n.author_id
      ORDER BY n.created_at`,
    sql<{ id: string; code: string }[]>`
      SELECT id, code FROM bookings
      WHERE status NOT IN ('COMPLETED','CLOSED','CANCELLED')
      ORDER BY service_start_at LIMIT 50`,
  ]);

  const open = tickets.filter((t) => t.state === "OPEN" || t.state === "WAITING");

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("page.support")}
        description={`${open.length} / ${tickets.length} · ${t("page.supportSub")}`}
      />

      <Alert tone="info" title="Severity decides the response, not the mood of the caller">
        SEV-1 is a passenger safety emergency or exposed personal data — on-call, immediately.
        SEV-2 is an upcoming trip at risk. SEV-3 is one booking. SEV-4 goes in the backlog.
      </Alert>

      <OpenTicketForm bookings={bookings} />

      {tickets.length === 0 ? (
        <EmptyState title="No tickets yet">
          Open one whenever a booking needs following up beyond a single message.
        </EmptyState>
      ) : (
        <ul className="space-y-4">
          {tickets.map((t) => {
            const severity = SEVERITY[t.severity] ?? SEVERITY.SEV3!;
            const thread = notes.filter((n) => n.ticket_id === t.id);
            return (
              <li key={t.id}>
                <Card className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={severity.tone}>{severity.label}</Badge>
                        <Badge tone={t.state === "OPEN" ? "warning" : t.state === "WAITING" ? "info" : "success"}>
                          {t.state.toLowerCase()}
                        </Badge>
                        {t.booking_code && (
                          <Link href={`/admin/bookings/${t.booking_id}`}
                                className="font-mono text-xs text-ink-900 underline">
                            {t.booking_code}
                          </Link>
                        )}
                      </div>
                      <p className="mt-2 font-medium text-ink-900">{t.subject}</p>
                      <p className="text-xs text-ink-500">
                        {t.category} · opened {new Date(t.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
                        {t.owner_email && ` · ${t.owner_email}`}
                      </p>
                    </div>
                  </div>

                  {thread.length > 0 && (
                    <ul className="mt-4 space-y-2 border-t border-ink-100 pt-3">
                      {thread.map((n, i) => (
                        <li key={i} className="text-sm">
                          <p className="text-xs text-ink-500">
                            {n.email ?? "system"} ·{" "}
                            {new Date(n.created_at).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}
                          </p>
                          <p className="mt-0.5 text-ink-700">{n.body}</p>
                        </li>
                      ))}
                    </ul>
                  )}

                  {t.resolution && (
                    <p className="mt-3 border-l-2 border-pine-500 pl-3 text-sm text-ink-700">
                      <span className="font-medium">Resolution: </span>{t.resolution}
                    </p>
                  )}

                  {!["RESOLVED", "CLOSED"].includes(t.state) && (
                    <div className="mt-4 border-t border-ink-100 pt-3">
                      <TicketActions ticketId={t.id} />
                    </div>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

interface Row {
  id: string; subject: string; category: string; severity: string; state: string;
  created_at: Date; resolved_at: Date | null; resolution: string | null;
  booking_code: string | null; booking_id: string | null; owner_email: string | null;
}
