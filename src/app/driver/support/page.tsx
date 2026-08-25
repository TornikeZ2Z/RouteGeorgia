import { requireUser } from "@/lib/auth/session";
import { sql } from "@db/client";
import { getTranslator, isLocale, type Locale, type MessageKey } from "@/lib/i18n";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { OpenTicket, ReplyToTicket } from "./forms";

export const dynamic = "force-dynamic";

const STATE_KEY: Record<string, MessageKey> = {
  OPEN: "console.tkOPEN", WAITING: "console.tkWAITING",
  RESOLVED: "console.tkRESOLVED", CLOSED: "console.tkCLOSED",
};

const CATEGORY_KEY: Record<string, MessageKey> = {
  BOOKING: "console.cBOOKING", PAYMENT: "console.cPAYMENT", VEHICLE: "console.cVEHICLE",
  DOCUMENTS: "console.cDOCUMENTS", ACCOUNT: "console.cACCOUNT", OTHER: "console.cOTHER",
};

export default async function DriverSupport() {
  const user = await requireUser();
  const t = getTranslator(isLocale(user.locale) ? (user.locale as Locale) : "ka");
  const [driver] = await sql<{ id: string }[]>`
    SELECT id FROM driver_profiles WHERE user_id = ${user.id}::uuid`;
  if (!driver) return <EmptyState title={t("console.noProfileT")} />;

  const tickets = await sql<TicketRow[]>`
    SELECT t.id, t.subject, t.category, t.state::text AS state, t.severity::text AS severity,
           t.created_at, t.resolution,
           (SELECT count(*)::int FROM support_attachments a WHERE a.ticket_id = t.id) AS files
    FROM support_tickets t
    WHERE t.driver_id = ${driver.id}::uuid
    ORDER BY t.created_at DESC
    LIMIT 40`;

  // Only notes deliberately marked as driver-facing. Operations' internal
  // commentary lives in the same table and must never surface here.
  const notes = tickets.length
    ? await sql<NoteRow[]>`
        SELECT n.id, n.ticket_id, n.body, n.created_at, n.author_id
        FROM support_notes n
        WHERE n.ticket_id = ANY(${tickets.map((x) => x.id)}::uuid[])
          AND n.visible_to_driver
        ORDER BY n.created_at`
    : [];

  const byTicket = new Map<string, NoteRow[]>();
  for (const n of notes) {
    const list = byTicket.get(n.ticket_id) ?? [];
    list.push(n);
    byTicket.set(n.ticket_id, list);
  }

  const openLabels = {
    title: t("console.openTicketT"), body: t("console.openTicketB"),
    subject: t("console.tkSubjectL"), subjectHint: t("console.tkSubjectHint"),
    category: t("console.tkCategoryL"),
    cBOOKING: t("console.cBOOKING"), cPAYMENT: t("console.cPAYMENT"),
    cVEHICLE: t("console.cVEHICLE"), cDOCUMENTS: t("console.cDOCUMENTS"),
    cACCOUNT: t("console.cACCOUNT"), cOTHER: t("console.cOTHER"),
    priority: t("console.tkPriorityL"),
    pHIGH: t("console.pHIGH"), pNORMAL: t("console.pNORMAL"), pLOW: t("console.pLOW"),
    booking: t("console.tkBookingL"), bookingHint: t("console.tkBookingHint"),
    details: t("console.tkDetailsL"), detailsHint: t("console.tkDetailsHint"),
    files: t("console.tkFilesL"), filesHint: t("console.tkFilesHint"),
    submit: t("console.tkSubmit"),
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t("console.supportTitle")} description={t("console.supportDesc")} />

      <Card className="p-4 sm:p-6">
        <OpenTicket labels={openLabels} />
      </Card>

      {tickets.length === 0 ? (
        <EmptyState title={t("console.noTicketsT")}>{t("console.noTicketsB")}</EmptyState>
      ) : (
        <section>
          <h2 className="mb-3 font-semibold text-ink-900">{t("console.yourTicketsT")}</h2>
          <ul className="space-y-4">
            {tickets.map((ticket) => {
              const thread = byTicket.get(ticket.id) ?? [];
              // "Answered" means somebody who is not the driver has replied.
              const answered = thread.some((n) => n.author_id !== user.id);
              return (
                <li key={ticket.id}>
                  <Card className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-ink-900">{ticket.subject}</p>
                        <p className="mt-0.5 text-xs text-ink-500">
                          {CATEGORY_KEY[ticket.category] ? t(CATEGORY_KEY[ticket.category]!) : ticket.category}
                          {" · "}
                          {new Date(ticket.created_at).toLocaleDateString("en-GB")}
                          {ticket.files > 0 && ` · ${t("console.tkFileCount", { count: ticket.files })}`}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {!answered && ticket.state !== "CLOSED" && (
                          <Badge tone="neutral">{t("console.tkWaitingOnUs")}</Badge>
                        )}
                        <Badge
                          tone={
                            ticket.state === "RESOLVED" || ticket.state === "CLOSED"
                              ? "success"
                              : ticket.state === "WAITING"
                                ? "warning"
                                : "info"
                          }
                        >
                          {STATE_KEY[ticket.state] ? t(STATE_KEY[ticket.state]!) : ticket.state}
                        </Badge>
                      </div>
                    </div>

                    <ul className="mt-3 space-y-2 border-t border-ink-100 pt-3">
                      {thread.map((note) => {
                        const mine = note.author_id === user.id;
                        return (
                          <li
                            key={note.id}
                            className={
                              mine
                                ? "rounded-lg bg-ink-50 px-3 py-2 text-sm"
                                : "rounded-lg bg-pine-50 px-3 py-2 text-sm"
                            }
                          >
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-xs font-semibold text-ink-700">
                                {mine ? t("console.threadYou") : t("console.threadSupport")}
                              </span>
                              <span className="text-xs text-ink-400">
                                {new Date(note.created_at).toLocaleString("en-GB", {
                                  dateStyle: "short", timeStyle: "short",
                                })}
                              </span>
                            </div>
                            <p className="mt-1 whitespace-pre-wrap text-ink-800">{note.body}</p>
                          </li>
                        );
                      })}
                    </ul>

                    {ticket.resolution && (
                      <p className="mt-2 rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-700">
                        <span className="font-semibold">{t("console.tkResolution")}: </span>
                        {ticket.resolution}
                      </p>
                    )}

                    {ticket.state !== "CLOSED" && (
                      <ReplyToTicket
                        ticketId={ticket.id}
                        labels={{
                          placeholder: t("console.threadPlaceholder"),
                          send: t("console.threadSend"),
                        }}
                      />
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

interface TicketRow {
  id: string; subject: string; category: string; state: string; severity: string;
  created_at: Date; resolution: string | null; files: number;
}
interface NoteRow {
  id: string; ticket_id: string; body: string; created_at: Date; author_id: string | null;
}
