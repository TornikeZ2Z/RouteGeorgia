import { requireUser } from "@/lib/auth/session";
import { getTranslator, isLocale, type Locale } from "@/lib/i18n";
import { sql } from "@db/client";
import { formatMoney } from "@/lib/money";
import { driverBalance } from "@/lib/ledger";
import { config } from "@/lib/config";
import { Alert, Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { OrderActions } from "./order-actions";
import { MessageThread, type ThreadMessage } from "./thread";
import { OrderFilters } from "./filters";
import { guessLocale } from "@/lib/translate";

export const dynamic = "force-dynamic";

const LIVE = ["CONFIRMED", "DRIVER_ACKNOWLEDGED", "READY", "DRIVER_ARRIVED", "IN_PROGRESS"];

export default async function DriverOrders({
  searchParams,
}: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const locale = (isLocale(user.locale) ? user.locale : "ka") as Locale;
  const t = getTranslator(locale);
  const [driver] = await sql<{ id: string }[]>`SELECT id FROM driver_profiles WHERE user_id = ${user.id}::uuid`;
  if (!driver) return <EmptyState title={t("console.noProfileT")} />;

  // Sections stop working somewhere around a hundred bookings, so the list is
  // searchable by code, route, traveller or address, and narrowable by date.
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => ((Array.isArray(v) ? v[0] : v) ?? "").trim();
  const q = one(sp.q).slice(0, 80);
  const fromDate = /^\d{4}-\d{2}-\d{2}$/.test(one(sp.from)) ? one(sp.from) : "";
  const toDate = /^\d{4}-\d{2}-\d{2}$/.test(one(sp.to)) ? one(sp.to) : "";
  const filtering = Boolean(q || fromDate || toDate);

  const [orders, balance] = await Promise.all([
    sql<Row[]>`
      SELECT b.id, b.code, b.status::text AS status, b.payment_mode::text AS payment_mode,
             b.service_start_at, b.gross_minor, b.driver_net_minor, b.commission_minor, b.currency,
             b.pickup_address, b.dropoff_address, b.flight_number, b.pickup_sign_name,
             b.passengers, b.children, b.luggage, b.child_seats, b.pets, b.notes,
             b.drive_minutes, b.customer_name, b.customer_phone, b.acknowledged_at,
             b.cash_confirmed_at, b.created_at,
             (SELECT string_agg(l.label, ' → ' ORDER BY l.position)
                FROM booking_legs l WHERE l.booking_id = b.id) AS route,
             (SELECT count(*) FROM messages m WHERE m.booking_id = b.id) AS message_count
      FROM bookings b
      WHERE b.driver_id = ${driver.id}::uuid
        AND b.status <> 'DRAFT'
        AND (${q} = '' OR b.code ILIKE ${'%' + q + '%'}
             OR coalesce(b.customer_name, '') ILIKE ${'%' + q + '%'}
             OR coalesce(b.pickup_address, '') ILIKE ${'%' + q + '%'}
             OR coalesce(b.dropoff_address, '') ILIKE ${'%' + q + '%'}
             OR EXISTS (SELECT 1 FROM booking_legs l
                        WHERE l.booking_id = b.id AND l.label ILIKE ${'%' + q + '%'}))
        AND (${fromDate} = '' OR b.service_start_at >= ${fromDate || null}::date)
        AND (${toDate} = '' OR b.service_start_at < (${toDate || null}::date + 1))
      ORDER BY
        CASE WHEN b.status = 'CONFIRMED' THEN 0 ELSE 1 END,
        b.service_start_at
      LIMIT 60`,
    driverBalance(driver.id),
  ]);

  // One query for every thread on the page rather than one per card.
  const threads = orders.length
    ? await sql<{ id: string; booking_id: string; sender: string; body: string; created_at: Date }[]>`
        SELECT id, booking_id, sender::text AS sender, body, created_at
        FROM messages
        WHERE booking_id = ANY(${orders.map((o) => o.id)}::uuid[])
        ORDER BY created_at`
    : [];

  const byBooking = new Map<string, ThreadMessage[]>();
  for (const m of threads) {
    const list = byBooking.get(m.booking_id) ?? [];
    list.push({
      id: m.id,
      sender: m.sender,
      body: m.body,
      createdAt: new Date(m.created_at).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }),
      // Cheap script check, so the translate control only appears where it
      // could actually help. The real decision happens server-side.
      foreign: guessLocale(m.body) !== locale,
    });
    byBooking.set(m.booking_id, list);
  }

  const threadLabels = {
    title: t("console.threadT"), empty: t("console.threadEmpty"),
    you: t("console.threadYou"), traveller: t("console.threadTraveller"),
    support: t("console.threadSupport"), placeholder: t("console.threadPlaceholder"),
    send: t("console.threadSend"), sending: t("console.threadSending"),
    translate: t("console.threadTranslate"), translating: t("console.threadTranslating"),
    original: t("console.threadOriginal"), unavailable: t("console.threadUnavailable"),
  };

  const needsAck = orders.filter((o) => o.status === "CONFIRMED");
  const live = orders.filter((o) => LIVE.includes(o.status) && o.status !== "CONFIRMED");
  const past = orders.filter((o) => !LIVE.includes(o.status));

  return (
    <div className="space-y-6">
      <PageHeader title={t("console.ordersTitle")} description={t("console.ordersDesc")} />

      {balance.cashBlocked && (
        <Alert tone="danger" title={t("console.cashBlockedT")}>
          {t("console.cashBlockedB", { amount: formatMoney(balance.owedToPlatformMinor, "GEL") })}
        </Alert>
      )}

      {needsAck.length > 0 && (
        <Alert tone="warning" title={t("console.needsAckT", { count: needsAck.length })}>
          {t("console.needsAckB", { minutes: config.policy.driverAckSlaMinutes })}
        </Alert>
      )}

      <OrderFilters
        q={q} from={fromDate} to={toDate}
        labels={{
          search: t("console.searchOrdersL"), searchHint: t("console.searchOrdersHint"),
          from: t("console.fromL"), to: t("console.toL"),
          apply: t("console.applyCta"), clear: t("console.clearCta"),
          count: t("console.ordersFound", { count: orders.length }),
        }}
      />

      {orders.length === 0 && (
        <EmptyState title={filtering ? t("console.noMatchT") : t("console.noOrdersT")}>
          {filtering ? t("console.noMatchB") : t("console.noOrdersB")}
        </EmptyState>
      )}

      {[[t("console.secNeedsAck"), needsAck], [t("console.secUpcoming"), live], [t("console.secPast"), past]].map(([title, list]) => {
        const rows = list as Row[];
        if (rows.length === 0) return null;
        return (
          <section key={title as string}>
            <h2 className="mb-3 font-semibold text-ink-900">{title as string}</h2>
            <ul className="space-y-4">
              {rows.map((o) => (
                <li key={o.id}>
                  <Card className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-medium text-ink-900">{o.code}</span>
                          <Badge tone={o.status === "CONFIRMED" ? "warning" : o.status === "COMPLETED" ? "success" : o.status === "CANCELLED" ? "danger" : "info"}>
                            {o.status.replaceAll("_", " ").toLowerCase()}
                          </Badge>
                          <Badge tone={o.payment_mode === "CASH" ? "warning" : "neutral"}>
                            {o.payment_mode === "CASH" ? t("console.collectCash") : t("console.paidOnline")}
                          </Badge>
                        </div>
                        <p className="mt-1 font-medium text-ink-900">{o.route}</p>
                        <p className="text-sm text-ink-600">
                          {new Date(o.service_start_at).toLocaleString("en-GB", { dateStyle: "full", timeStyle: "short" })}
                          {" · "}{Math.floor(o.drive_minutes / 60)} h {o.drive_minutes % 60} min
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="text-lg font-semibold text-ink-900">
                          {formatMoney(BigInt(o.driver_net_minor), o.currency)}
                        </p>
                        <p className="text-xs text-ink-500">
                          {t("console.yourEarnings")} · {t("console.fare", { amount: formatMoney(BigInt(o.gross_minor), o.currency) })}
                        </p>
                      </div>
                    </div>

                    {/* Full detail only once the driver has committed to the trip. */}
                    {o.status !== "CONFIRMED" && !["CANCELLED"].includes(o.status) && (
                      <dl className="mt-3 grid gap-2 border-t border-ink-100 pt-3 text-sm sm:grid-cols-2">
                        <div><dt className="text-ink-500">{t("console.pickupLabel")}</dt><dd>{o.pickup_address}</dd></div>
                        <div><dt className="text-ink-500">{t("console.dropoffLabel")}</dt><dd>{o.dropoff_address}</dd></div>
                        <div><dt className="text-ink-500">{t("console.travellerLabel")}</dt>
                          <dd>{o.customer_name} · {o.customer_phone}</dd></div>
                        <div><dt className="text-ink-500">{t("console.partyLabel")}</dt>
                          <dd>{o.passengers} passenger(s){o.children > 0 && `, ${o.children} child(ren)`}
                            {o.child_seats > 0 && `, ${o.child_seats} child seat(s)`}{o.pets && ", pet"}</dd></div>
                        {o.flight_number && <div><dt className="text-ink-500">{t("console.flightLabel")}</dt><dd>{o.flight_number}</dd></div>}
                        {o.pickup_sign_name && <div><dt className="text-ink-500">{t("console.signLabel")}</dt><dd>{o.pickup_sign_name}</dd></div>}
                        {o.notes && <div className="sm:col-span-2"><dt className="text-ink-500">{t("console.notesLabel")}</dt><dd>{o.notes}</dd></div>}
                      </dl>
                    )}

                    {/* The traveller could always write; now the driver can
                        read it and answer. Hidden only once a trip is over
                        and nothing was ever said. */}
                    {(o.status !== "CANCELLED") &&
                      (LIVE.includes(o.status) || (byBooking.get(o.id)?.length ?? 0) > 0) && (
                      <MessageThread
                        bookingId={o.id}
                        messages={byBooking.get(o.id) ?? []}
                        labels={threadLabels}
                      />
                    )}

                    <div className="mt-3 border-t border-ink-100 pt-3">
                      <OrderActions
                        bookingId={o.id}
                        status={o.status}
                        paymentMode={o.payment_mode}
                        cashConfirmed={Boolean(o.cash_confirmed_at)}
                        locale={user.locale}
                      />
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

interface Row {
  id: string; code: string; status: string; payment_mode: string; service_start_at: Date;
  gross_minor: string; driver_net_minor: string; commission_minor: string; currency: string;
  pickup_address: string; dropoff_address: string; flight_number: string | null;
  pickup_sign_name: string | null; passengers: number; children: number; luggage: number;
  child_seats: number; pets: boolean; notes: string | null; drive_minutes: number;
  customer_name: string | null; customer_phone: string | null; acknowledged_at: Date | null;
  cash_confirmed_at: Date | null; created_at: Date; route: string | null; message_count: number;
}
