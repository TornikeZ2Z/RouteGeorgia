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
  | "support.driver_ticket" | "support.driver_reply"
  | "change_request.submitted";

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
  send(message: {
    to: string; subject: string; body: string; channel: string;
    /** Correlates a delivery receipt back to the queued row. SMS only. */
    reference?: string;
  }): Promise<{ ref: string }>;
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
      /*
       * Bounded, because an unreachable SMTP port does not refuse — it hangs.
       * Outbound 25/465/587 is blocked by a great many hosts and ISPs, and
       * nodemailer's defaults wait minutes before admitting it. Anything that
       * awaits a send inherits that wait.
       */
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
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
 * smsoffice.ge, over its v2 HTTP API.
 *
 * One authenticated POST per message — no SDK, same reasoning as Resend.
 * The gateway wants numbers as 995XXXXXXXXX with no plus and no spaces, and
 * Georgian mobiles are the only numbers this platform ever texts, so the
 * normaliser is deliberately that narrow: a local 5XXXXXXXX gets the country
 * code; anything else is passed through digits-only and left to the gateway
 * to accept or reject loudly.
 */
export function normalizeGeorgianMobile(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 9 && digits.startsWith("5")) return `995${digits}`;
  return digits;
}

/**
 * Sender names are far more constrained than a brand name is.
 *
 * smsoffice allows only letters, digits, hyphen and full stop, up to eleven
 * characters — no spaces. A brand with a space in it therefore cannot be
 * registered as typed, so anything disallowed is stripped rather than sent to
 * be rejected with error 110 or 150. The result must still match the sender
 * actually registered on the account, which is why the substitution is
 * announced in the log the first time it happens.
 */
let senderWarned = false;

export function normalizeSender(raw: string): string {
  const cleaned = raw.replace(/[^A-Za-z0-9.-]/g, "").slice(0, 11);
  if (!senderWarned && cleaned !== raw) {
    senderWarned = true;
    console.warn(
      `[sms] sender ${JSON.stringify(raw)} is not a legal smsoffice sender; ` +
      `using ${JSON.stringify(cleaned)}. Register exactly this on smsoffice.ge.`,
    );
  }
  return cleaned;
}

/**
 * What the gateway's numeric replies mean, so a failure in the outbox reads as
 * a cause rather than a number. Taken from the published table; anything not
 * listed is reported with its code.
 */
const SMSOFFICE_CODES: Record<number, string> = {
  0: "accepted for delivery",
  10: "destination contains non-Georgian numbers",
  20: "account balance is insufficient",
  40: "message is longer than the gateway accepts",
  60: "content parameter was empty",
  70: "no destination numbers supplied",
  75: "every number is on the stop list",
  76: "every number was in an invalid format",
  77: "every number is on the stop list or invalid",
  80: "no account matches the API key",
  110: "sender name was not understood",
  120: "API access is not enabled on the smsoffice profile",
  150: "sender name is not registered on the account",
  500: "key parameter missing",
  600: "destination parameter missing",
  700: "sender parameter missing",
  800: "content parameter missing",
  [-100]: "temporary gateway fault",
};

const smsOfficeTransport: Transport = {
  name: "smsoffice",
  async send(message) {
    const params = new URLSearchParams({
      key: config.sms.apiKey,
      destination: normalizeGeorgianMobile(message.to),
      sender: normalizeSender(config.sms.sender),
      // SMS has no subject line; the body is the whole message.
      content: message.body,
      // Delivery receipts are only correlated when a reference was sent, and
      // the gateway caps it at 20 characters.
      ...(message.reference ? { reference: message.reference.slice(0, 20) } : {}),
      // Reaches numbers that have blocked bulk SMS. Requires the sender to be
      // registered and active, which is also required for any send at all.
      urgent: "true",
    });

    // The trailing slash is required on POST; without it the gateway 404s.
    const response = await fetch("https://smsoffice.ge/api/v2/send/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(`smsoffice answered ${response.status}`);
    }

    const data = (await response.json()) as {
      Success?: boolean; Message?: string; Output?: unknown; ErrorCode?: number;
    };
    if (!data.Success) {
      // The dispatcher records last_error and retries; the recipient's number
      // is already on the row, so the reason alone is enough here.
      const code = data.ErrorCode;
      const meaning = typeof code === "number" ? SMSOFFICE_CODES[code] : undefined;
      throw new Error(
        `smsoffice refused: ${meaning ?? data.Message ?? "no reason given"}` +
        (typeof code === "number" ? ` (code ${code})` : ""),
      );
    }

    // Output carries the gateway's own identifier for the batch.
    const ref = typeof data.Output === "string" || typeof data.Output === "number"
      ? String(data.Output)
      : message.reference ?? `smsoffice-${Date.now()}`;
    return { ref };
  },
};

const smsConfigured = () => Boolean(config.sms.apiKey && config.sms.sender);

/**
 * Which transport actually carries a message.
 *
 * SMTP wins over Resend when both are configured, because SMTP is the one
 * someone set up deliberately for this domain. SMS goes through smsoffice.ge
 * once its key and sender are set, and to the log until then.
 */
export function getTransport(): Transport {
  const email =
    smtpConfigured() ? smtpTransport
    : config.mail.resendApiKey ? resendTransport
    : null;
  const sms = smsConfigured() ? smsOfficeTransport : null;

  if (!email && !sms) return consoleTransport;

  return {
    name: `${email?.name ?? "console"}+${sms?.name ?? "console"}`,
    async send(message) {
      if (message.channel === "EMAIL" && email) return email.send(message);
      if (message.channel === "SMS" && sms) return sms.send(message);
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
        // Hyphens stripped so a UUID still fits the gateway's 20-char cap with
        // enough of it left to identify the row uniquely.
        reference: row.id.replace(/-/g, "").slice(0, 20),
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

/**
 * Send what is queued, without making anyone wait for it.
 *
 * Sending belongs after the response, not inside it. The outbox exists so that
 * a queued message is already durable by the time the user sees "sent" — and
 * awaiting the send throws that away: the row is safe, and the reply is held
 * hostage to a mail server that may be unreachable.
 *
 * That is not hypothetical. With outbound SMTP blocked, awaiting a dispatch
 * held a form POST open until the connection timed out. The submission had
 * already been saved; the browser just never heard so, and the person filed it
 * again. A blocked mail port should cost an unsent email, not a duplicate
 * booking.
 *
 * Deliberately returns void. Anything a caller could await here is the mistake
 * this function exists to prevent — with one exception, the console's manual
 * resend, which reports the outcome and so must wait for it.
 */
export function dispatchInBackground(limit = 25, only?: readonly string[]): void {
  void dispatchPending(limit, only).catch(() => {
    // Already recorded on the row as last_error, and visible in the outbox.
  });
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
