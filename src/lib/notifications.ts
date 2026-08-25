import "server-only";
import { createHash } from "node:crypto";
import type { Sql, TransactionSql } from "postgres";
import { sql as rootSql } from "@db/client";
import { createTransport, type Transporter } from "nodemailer";
import { config } from "@/lib/config";
import { formatMoney } from "@/lib/money";
import type { Locale } from "@/lib/i18n";

/**
 * Transactional notifications, written through an outbox.
 *
 * The row is inserted in the SAME transaction as the change that caused it,
 * so a confirmed booking can never end up without a queued confirmation. A
 * separate dispatcher sends them and records the outcome; a send failure is
 * retried rather than lost, and `dedupe_key` makes retries idempotent.
 */
type Executor = Sql | TransactionSql;

export type NotificationKind =
  | "booking.confirmed.customer" | "booking.confirmed.driver"
  | "booking.cancelled.customer" | "booking.cancelled.driver"
  | "booking.acknowledged.customer" | "booking.driver_reassigned.customer"
  | "booking.reminder.customer" | "booking.completed.customer"
  | "review.invitation" | "message.received"
  | "contract.ready"
  | "support.driver_ticket" | "support.driver_reply";

export interface QueueInput {
  kind: NotificationKind;
  channel?: "EMAIL" | "SMS";
  to: string;
  locale?: string;
  subject: string;
  body: string;
  bookingId?: string | null;
  /**
   * The account this concerns, when there is one. Email and SMS do not need
   * it — they have an address — but the in-portal inbox does: without it a
   * notification is something we sent into the world with nobody to show it
   * to. Optional, because a traveller without an account still gets email.
   */
  userId?: string | null;
  /** Anything that makes this notification unique. Retries reuse it. */
  dedupe: string;
  payload?: Record<string, unknown>;
}

/**
 * Returns the new row's id, or null when the dedupe key already existed and
 * nothing was inserted. Callers that need a specific message sent promptly —
 * rather than whatever is oldest in the outbox — pass it to `dispatchPending`.
 */
export async function queue(tx: Executor, input: QueueInput): Promise<string | null> {
  const dedupeKey = createHash("sha256")
    .update(`${input.kind}:${input.dedupe}`)
    .digest("hex");

  const rows = await tx<{ id: string }[]>`
    INSERT INTO notifications (kind, channel, to_address, locale, subject, body, payload,
                               booking_id, user_id, dedupe_key)
    VALUES (${input.kind}, ${input.channel ?? "EMAIL"}::notify_channel, ${input.to},
            ${input.locale ?? "en"}, ${input.subject}, ${input.body},
            ${JSON.stringify(input.payload ?? {})}::text::jsonb,
            ${input.bookingId ?? null}::uuid, ${input.userId ?? null}::uuid, ${dedupeKey})
    ON CONFLICT (dedupe_key) DO NOTHING
    RETURNING id`;
  return rows[0]?.id ?? null;
}

// ------------------------------------------------------------- transport ---

export interface Transport {
  readonly name: string;
  send(message: { to: string; subject: string; body: string; channel: string }): Promise<{ ref: string }>;
}

/**
 * Development transport: writes to the console and to the notifications table.
 * Swap for a real provider (Postmark, SES, Resend) by implementing this
 * interface — nothing else in the app changes.
 */
const consoleTransport: Transport = {
  name: "console",
  async send(message) {
    console.info(
      `\n──── ${message.channel} to ${message.to} ────\n${message.subject}\n\n${message.body}\n────────\n`,
    );
    return { ref: `console-${Date.now()}` };
  },
};

/**
 * Resend, over its REST API.
 *
 * Deliberately not the SDK: this is one authenticated POST, and every
 * dependency added to this project has to be installed on a Linux build host
 * from a lock file resolved on Windows — a trade that has already cost more
 * than it was worth today.
 *
 * Bodies are plain text. These messages are a set-password link, a booking
 * confirmation and a contract notice; they are read on cheap Android phones,
 * they have to survive a text-only mail client, and plain text does not land
 * in spam the way a bare HTML template does.
 */
const resendTransport: Transport = {
  name: "resend",
  async send(message) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.mail.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.mail.from,
        to: [message.to],
        subject: message.subject,
        text: message.body,
      }),
    });

    if (!response.ok) {
      // Thrown so dispatchPending records it in last_error and retries. A
      // silent failure here is a driver who never hears from us.
      const detail = await response.text().catch(() => "");
      throw new Error(`resend ${response.status}: ${detail.slice(0, 200)}`);
    }

    const result = (await response.json().catch(() => ({}))) as { id?: string };
    return { ref: result.id ?? "resend" };
  },
};

/**
 * SMTP, for Google Workspace and anything else that speaks it.
 *
 * The connection is built once and reused: Gmail counts connections as well
 * as messages, and opening a fresh one per email is how an account ends up
 * rate limited. Nodemailer pools and re-authenticates on its own.
 */
let mailer: Transporter | null = null;

const smtpTransport: Transport = {
  name: "smtp",
  async send(message) {
    mailer ??= createTransport({
      host: config.mail.smtp.host,
      port: config.mail.smtp.port,
      // 465 is implicit TLS; 587 upgrades with STARTTLS. Never plaintext:
      // this connection carries a password on every message.
      secure: config.mail.smtp.port === 465,
      requireTLS: config.mail.smtp.port !== 465,
      auth: { user: config.mail.smtp.user, pass: config.mail.smtp.password },
      pool: true,
      maxConnections: 2,
    });

    const info = await mailer.sendMail({
      from: config.mail.from,
      to: message.to,
      subject: message.subject,
      text: message.body,
    });
    return { ref: info.messageId ?? "smtp" };
  },
};

const smtpConfigured = () =>
  Boolean(config.mail.smtp.host && config.mail.smtp.user && config.mail.smtp.password);

/**
 * Which transport actually carries a message.
 *
 * SMTP wins over Resend when both are configured, because SMTP is the one
 * someone set up deliberately for this domain. SMS has no provider yet and
 * still prints to the log — routing by channel here means adding one later
 * touches only this function.
 */
export function getTransport(): Transport {
  const email =
    smtpConfigured() ? smtpTransport
    : config.mail.resendApiKey ? resendTransport
    : null;

  if (!email) return consoleTransport;

  return {
    name: `${email.name}+console`,
    async send(message) {
      if (message.channel === "EMAIL") return email.send(message);
      return consoleTransport.send(message);
    },
  };
}

/**
 * Send queued notifications. Called after a booking action and by any
 * scheduled worker. Safe to run concurrently: rows are claimed with
 * SKIP LOCKED so two dispatchers never send the same message twice.
 */
export async function dispatchPending(
  limit = 25,
  /**
   * Restrict the batch to specific rows. Without it the outbox is drained
   * oldest-first, which is right for a background worker and wrong when one
   * message must go now: a single message queued behind a long backlog of
   * older retries would wait for cycles that nothing on this deployment
   * currently runs. Pass the id from `queue` to send just that one.
   */
  only?: readonly string[],
): Promise<{ sent: number; failed: number }> {
  const transport = getTransport();
  let sent = 0;
  let failed = 0;

  const ids = only && only.length > 0 ? [...only] : null;

  const claimed = await rootSql<{ id: string; channel: string; to_address: string; subject: string; body: string }[]>`
    UPDATE notifications SET state = 'SENDING', attempts = attempts + 1
    WHERE id IN (
      SELECT id FROM notifications
      WHERE state IN ('QUEUED','FAILED') AND attempts < 5
        AND (${ids}::uuid[] IS NULL OR id = ANY(${ids}::uuid[]))
      ORDER BY created_at
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED)
    RETURNING id, channel::text, to_address, subject, body`;

  for (const row of claimed) {
    try {
      await transport.send({
        to: row.to_address, subject: row.subject ?? "", body: row.body, channel: row.channel,
      });
      await rootSql`UPDATE notifications SET state='SENT', sent_at=now(), last_error=NULL WHERE id=${row.id}::uuid`;
      sent++;
    } catch (err) {
      await rootSql`
        UPDATE notifications SET state='FAILED', last_error=${String(err).slice(0, 400)}
        WHERE id=${row.id}::uuid`;
      failed++;
    }
  }
  return { sent, failed };
}

// ------------------------------------------------------------- templates ---

interface BookingSummary {
  code: string;
  customerName: string | null;
  driverName: string;
  vehicle: string;
  serviceStartAt: Date;
  route: string;
  grossMinor: bigint;
  currency: string;
  paymentMode: "CASH" | "CARD";
  manageUrl?: string;
}

const when = (d: Date, locale: string) =>
  d.toLocaleString(locale === "ka" ? "ka-GE" : locale === "ru" ? "ru-RU" : "en-GB", {
    dateStyle: "full", timeStyle: "short", timeZone: "Asia/Tbilisi",
  });

/**
 * Email copy per locale.
 *
 * The templates always accepted a locale and then sent English regardless —
 * the parameter was decoration. A Georgian driver getting English "please
 * confirm" emails is the same failure the interface had, in the channel they
 * actually watch.
 */
const M = {
  en: {
    confirmedSubject: (b: BookingSummary) => `Booking ${b.code} confirmed — ${b.route}`,
    confirmedBody: (b: BookingSummary, price: string, l: Locale) => [
      `Your driver is confirmed.`, ``,
      `Booking reference: ${b.code}`,
      `Route: ${b.route}`,
      `Pickup: ${when(b.serviceStartAt, l)} (Georgia time)`,
      `Driver: ${b.driverName}`,
      `Vehicle: ${b.vehicle}`,
      `Price: ${price} for the whole vehicle`,
      b.paymentMode === "CASH"
        ? `Payment: cash to the driver at the end of the trip.`
        : `Payment: paid online. Nothing to pay the driver.`,
      ``,
      `Driving time excludes stops, traffic, border and weather delays.`,
      b.manageUrl ? `\nView or cancel your booking:\n${b.manageUrl}` : ``,
      ``,
      `Free cancellation. We ask for at least 24 hours' notice where possible.`,
    ],
    driverSubject: (b: BookingSummary) => `New booking ${b.code} — ${b.route}`,
    driverBody: (b: BookingSummary, gross: string, net: string, l: Locale) => [
      `You have a new booking. Please confirm it in the app.`, ``,
      `Reference: ${b.code}`,
      `Route: ${b.route}`,
      `Pickup: ${when(b.serviceStartAt, l)}`,
      `Fare: ${gross}`,
      `Your earnings: ${net}`,
      b.paymentMode === "CASH"
        ? `Collect the fare in cash. Our commission is added to your balance.`
        : `The traveller has already paid online. Do not collect cash.`,
      ``, `${config.appUrl}/driver/orders`,
    ],
    cancelSubject: (b: BookingSummary) => `Booking ${b.code} cancelled`,
    cancelBody: (b: BookingSummary, reason: string, l: Locale) => [
      `Booking ${b.code} (${b.route}, ${when(b.serviceStartAt, l)}) has been cancelled.`, ``,
      `Reason: ${reason}`, ``,
      b.paymentMode === "CARD"
        ? `Any payment taken will be refunded to the original card. Banks usually take 5–10 working days.`
        : `Nothing was charged.`,
    ],
    reviewSubject: (b: BookingSummary) => `How was your trip with ${b.driverName}?`,
    reviewBody: (b: BookingSummary, url: string, l: Locale) => [
      `Thank you for travelling with us.`, ``,
      `Your trip on ${when(b.serviceStartAt, l)} (${b.route}) is complete.`,
      `Please tell us how ${b.driverName} did — it takes under a minute.`,
      ``, url, ``, `This link works once and expires in 30 days.`,
    ],
  },
  ka: {
    confirmedSubject: (b: BookingSummary) => `ჯავშანი ${b.code} დადასტურდა — ${b.route}`,
    confirmedBody: (b: BookingSummary, price: string, l: Locale) => [
      `თქვენი მძღოლი დადასტურებულია.`, ``,
      `ჯავშნის ნომერი: ${b.code}`,
      `მარშრუტი: ${b.route}`,
      `შეხვედრა: ${when(b.serviceStartAt, l)} (საქართველოს დროით)`,
      `მძღოლი: ${b.driverName}`,
      `ავტომობილი: ${b.vehicle}`,
      `ფასი: ${price} მთელ ავტომობილზე`,
      b.paymentMode === "CASH"
        ? `გადახდა: ნაღდი მძღოლთან, მგზავრობის ბოლოს.`
        : `გადახდა: გადახდილია ონლაინ. მძღოლთან არაფერია გადასახდელი.`,
      ``,
      `გზაში დრო არ მოიცავს გაჩერებებს, საცობებსა და ამინდის შეფერხებებს.`,
      b.manageUrl ? `\nჯავშნის ნახვა ან გაუქმება:\n${b.manageUrl}` : ``,
      ``,
      `გაუქმება უფასოა. შეძლებისდაგვარად 24 საათით ადრე გვაცნობეთ.`,
    ],
    driverSubject: (b: BookingSummary) => `ახალი ჯავშანი ${b.code} — ${b.route}`,
    driverBody: (b: BookingSummary, gross: string, net: string, l: Locale) => [
      `გაქვთ ახალი ჯავშანი. გთხოვთ, დაადასტუროთ აპლიკაციაში.`, ``,
      `ნომერი: ${b.code}`,
      `მარშრუტი: ${b.route}`,
      `შეხვედრა: ${when(b.serviceStartAt, l)}`,
      `ტარიფი: ${gross}`,
      `თქვენი შემოსავალი: ${net}`,
      b.paymentMode === "CASH"
        ? `ტარიფი აიღეთ ნაღდით. ჩვენი საკომისიო თქვენს ბალანსს დაემატება.`
        : `მგზავრს უკვე გადახდილი აქვს ონლაინ. ნაღდი არ აიღოთ.`,
      ``, `${config.appUrl}/driver/orders`,
    ],
    cancelSubject: (b: BookingSummary) => `ჯავშანი ${b.code} გაუქმდა`,
    cancelBody: (b: BookingSummary, reason: string, l: Locale) => [
      `ჯავშანი ${b.code} (${b.route}, ${when(b.serviceStartAt, l)}) გაუქმებულია.`, ``,
      `მიზეზი: ${reason}`, ``,
      b.paymentMode === "CARD"
        ? `გადახდილი თანხა იმავე ბარათზე დაბრუნდება. ბანკებს ჩვეულებრივ 5–10 სამუშაო დღე სჭირდებათ.`
        : `არაფერი ჩამოჭრილა.`,
    ],
    reviewSubject: (b: BookingSummary) => `როგორ იმგზავრეთ ${b.driverName}-თან?`,
    reviewBody: (b: BookingSummary, url: string, l: Locale) => [
      `გმადლობთ, რომ ჩვენთან იმგზავრეთ.`, ``,
      `თქვენი მგზავრობა ${when(b.serviceStartAt, l)} (${b.route}) დასრულდა.`,
      `გვითხარით, როგორი იყო ${b.driverName} — წუთზე ნაკლები დაგჭირდებათ.`,
      ``, url, ``, `ბმული ერთხელ მუშაობს და 30 დღეში იწურება.`,
    ],
  },
  ru: {
    confirmedSubject: (b: BookingSummary) => `Бронирование ${b.code} подтверждено — ${b.route}`,
    confirmedBody: (b: BookingSummary, price: string, l: Locale) => [
      `Ваш водитель подтверждён.`, ``,
      `Номер бронирования: ${b.code}`,
      `Маршрут: ${b.route}`,
      `Встреча: ${when(b.serviceStartAt, l)} (время Грузии)`,
      `Водитель: ${b.driverName}`,
      `Автомобиль: ${b.vehicle}`,
      `Цена: ${price} за весь автомобиль`,
      b.paymentMode === "CASH"
        ? `Оплата: наличными водителю в конце поездки.`
        : `Оплата: онлайн. Водителю платить ничего не нужно.`,
      ``,
      `Время в пути не включает остановки, пробки, границу и погоду.`,
      b.manageUrl ? `\nПосмотреть или отменить бронирование:\n${b.manageUrl}` : ``,
      ``,
      `Отмена бесплатна. По возможности предупредите за 24 часа.`,
    ],
    driverSubject: (b: BookingSummary) => `Новое бронирование ${b.code} — ${b.route}`,
    driverBody: (b: BookingSummary, gross: string, net: string, l: Locale) => [
      `У вас новое бронирование. Подтвердите его в приложении.`, ``,
      `Номер: ${b.code}`,
      `Маршрут: ${b.route}`,
      `Встреча: ${when(b.serviceStartAt, l)}`,
      `Тариф: ${gross}`,
      `Ваш доход: ${net}`,
      b.paymentMode === "CASH"
        ? `Получите тариф наличными. Наша комиссия будет добавлена к вашему балансу.`
        : `Пассажир уже оплатил онлайн. Наличные не берите.`,
      ``, `${config.appUrl}/driver/orders`,
    ],
    cancelSubject: (b: BookingSummary) => `Бронирование ${b.code} отменено`,
    cancelBody: (b: BookingSummary, reason: string, l: Locale) => [
      `Бронирование ${b.code} (${b.route}, ${when(b.serviceStartAt, l)}) отменено.`, ``,
      `Причина: ${reason}`, ``,
      b.paymentMode === "CARD"
        ? `Оплата вернётся на ту же карту. Банкам обычно нужно 5–10 рабочих дней.`
        : `Ничего не списывалось.`,
    ],
    reviewSubject: (b: BookingSummary) => `Как прошла поездка с ${b.driverName}?`,
    reviewBody: (b: BookingSummary, url: string, l: Locale) => [
      `Спасибо, что поехали с нами.`, ``,
      `Ваша поездка ${when(b.serviceStartAt, l)} (${b.route}) завершена.`,
      `Расскажите, как справился ${b.driverName} — это займёт меньше минуты.`,
      ``, url, ``, `Ссылка работает один раз и истекает через 30 дней.`,
    ],
  },
} as const;

const pick = (locale: Locale | string) =>
  M[(locale === "ka" || locale === "ru" ? locale : "en") as "en" | "ka" | "ru"];

export function customerConfirmation(b: BookingSummary, locale: Locale) {
  const m = pick(locale);
  const price = formatMoney(b.grossMinor, b.currency, locale);
  return { subject: m.confirmedSubject(b), body: m.confirmedBody(b, price, locale).join("\n") };
}

export function driverAssignment(b: BookingSummary, netMinor: bigint, locale: Locale) {
  const m = pick(locale);
  return {
    subject: m.driverSubject(b),
    body: m.driverBody(b, formatMoney(b.grossMinor, b.currency, locale),
                       formatMoney(netMinor, b.currency, locale), locale).join("\n"),
  };
}

export function cancellationNotice(b: BookingSummary, reason: string, locale: Locale) {
  const m = pick(locale);
  return { subject: m.cancelSubject(b), body: m.cancelBody(b, reason, locale).join("\n") };
}

export function reviewInvitation(b: BookingSummary, reviewUrl: string, locale: Locale) {
  const m = pick(locale);
  return { subject: m.reviewSubject(b), body: m.reviewBody(b, reviewUrl, locale).join("\n") };
}
