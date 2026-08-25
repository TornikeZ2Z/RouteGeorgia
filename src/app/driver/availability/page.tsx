import { requireUser } from "@/lib/auth/session";
import { sql } from "@db/client";
import { listBlocks } from "@/lib/availability";
import { getTranslator, isLocale, type Locale, type MessageKey } from "@/lib/i18n";
import { Alert, Badge, Card, EmptyState, Field, Input, PageHeader, Select, Table } from "@/components/ui";
import { ActionForm } from "@/components/form-state";
import { addAvailabilityBlockAction } from "../actions";
import { WorkDayCalendar } from "./workdays";
import { RemoveBlock } from "./remove";
import { TodayControls, RangeControls, PatternControls } from "./quick";
import { getPattern, materialisePattern, PATTERN_HORIZON_DAYS } from "@/lib/availability-patterns";

export const dynamic = "force-dynamic";

const KIND_KEY: Record<string, MessageKey> = {
  BOOKING: "console.kBOOKING", TIME_OFF: "console.kTimeOff",
  BUSY: "console.kBusy", REST_BUFFER: "console.kREST_BUFFER",
};

export default async function AvailabilityPage() {
  const user = await requireUser();
  const locale = (isLocale(user.locale) ? user.locale : "ka") as Locale;
  const t = getTranslator(locale);
  const [driver] = await sql<{ id: string }[]>`SELECT id FROM driver_profiles WHERE user_id = ${user.id}::uuid`;
  if (!driver) return <EmptyState title={t("console.noProfileT")} />;

  // Re-materialising here keeps the pattern's horizon rolling forward without
  // a scheduled job: the driver visiting this page is what extends it.
  await materialisePattern(driver.id);

  const from = new Date();
  const to = new Date(Date.now() + 60 * 86_400_000);
  const [blocks, weekdays, pendingBookings] = await Promise.all([
    listBlocks(driver.id, from, to),
    getPattern(driver.id),
    // CONFIRMED means the traveller has booked but the driver has not yet
    // acknowledged. Those days are spoken for without being agreed.
    sql<{ starts_at: Date; ends_at: Date }[]>`
      SELECT service_start_at AS starts_at,
             service_start_at + make_interval(mins => greatest(drive_minutes, 60)) AS ends_at
      FROM bookings
      WHERE driver_id = ${driver.id}::uuid AND status = 'CONFIRMED'`,
  ]);

  // Working-days grid, resolved in Georgian time (UTC+4, no DST).
  const TB = 4 * 3600_000;
  const dayKey = (d: Date) => new Date(d.getTime() + TB).toISOString().slice(0, 10);
  const todayStart = new Date(`${dayKey(new Date())}T00:00:00+04:00`);
  const monthLocale = locale === "ka" ? "ka-GE" : locale === "ru" ? "ru-RU" : "en";
  const days = Array.from({ length: 56 }, (_, i) => {
    const start = new Date(todayStart.getTime() + i * 86_400_000);
    const end = new Date(start.getTime() + 86_400_000);
    // lower()/upper() of a range come back as strings from the driver.
    const overlapping = blocks.filter((b) => new Date(b.startsAt) < end && new Date(b.endsAt) > start);
    const awaitingAck = pendingBookings.some(
      (b) => new Date(b.starts_at) < end && new Date(b.ends_at) > start,
    );
    const state = awaitingAck
      ? ("pending" as const)
      : overlapping.some((b) => b.kind === "BOOKING" || b.kind === "REST_BUFFER")
        ? ("booked" as const)
        : overlapping.length > 0 ? ("off" as const) : ("work" as const);
    const inTbilisi = new Date(start.getTime() + TB);
    return {
      key: dayKey(start),
      label: inTbilisi.getUTCDate(),
      month: inTbilisi.toLocaleString(monthLocale, { month: "short", timeZone: "UTC" }),
      state,
    };
  });

  const quickLabels = {
    todayT: t("console.todayT"), todayB: t("console.todayB"),
    blockToday: t("console.blockToday"), freeToday: t("console.freeToday"),
    rangeT: t("console.rangeT"), rangeB: t("console.rangeB", { days: PATTERN_HORIZON_DAYS }),
    from: t("console.fromL"), to: t("console.toL"),
    blockRange: t("console.blockRangeCta"), freeRange: t("console.freeRangeCta"),
    patternT: t("console.patternT"), patternB: t("console.patternB", { days: PATTERN_HORIZON_DAYS }),
    savePattern: t("console.savePatternCta"),
    days: [
      t("console.daySun"), t("console.dayMon"), t("console.dayTue"), t("console.dayWed"),
      t("console.dayThu"), t("console.dayFri"), t("console.daySat"),
    ],
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t("console.availTitle")} description={t("console.availDesc")} />

      <Card className="p-4 sm:p-6"><TodayControls labels={quickLabels} /></Card>

      <Card className="p-4 sm:p-6"><RangeControls labels={quickLabels} /></Card>

      <Card className="p-4 sm:p-6">
        <PatternControls selected={weekdays} labels={quickLabels} />
      </Card>

      <Card className="p-4 sm:p-6">
        <h2 className="font-semibold text-ink-900">{t("console.workDaysT")}</h2>
        <p className="mt-1 text-sm text-ink-500">{t("console.workDaysB")}</p>
        <WorkDayCalendar
          days={days}
          labels={{
            work: t("console.legWork"), off: t("console.legOff"),
            booked: t("console.legBooked"), pending: t("console.legPending"),
            tipWork: t("console.tipWork"), tipOff: t("console.tipOff"),
            tipBooked: t("console.tipBooked"), tipPending: t("console.tipPending"),
          }}
        />
      </Card>

      <Alert tone="info" title={t("console.howBlockT")}>{t("console.howBlockB")}</Alert>

      <Card className="p-4 sm:p-6">
        <h2 className="mb-4 font-semibold text-ink-900">{t("console.blockOffT")}</h2>
        <ActionForm action={addAvailabilityBlockAction} submitLabel={t("console.addBlockCta")}>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t("console.fromL")} htmlFor="startsAt" required>
              <Input id="startsAt" name="startsAt" type="datetime-local" required />
            </Field>
            <Field label={t("console.toL")} htmlFor="endsAt" required>
              <Input id="endsAt" name="endsAt" type="datetime-local" required />
            </Field>
            <Field label={t("console.reasonL")} htmlFor="kind" hint={t("console.reasonPrivHint")}>
              <Select id="kind" name="kind" defaultValue="TIME_OFF">
                <option value="TIME_OFF">{t("console.kTimeOff")}</option>
                <option value="BUSY">{t("console.kBusy")}</option>
              </Select>
            </Field>
          </div>
        </ActionForm>
      </Card>

      {blocks.length === 0 ? (
        <EmptyState title={t("console.calClearT")} />
      ) : (
        <Table head={[t("console.fromL"), t("console.toL"), t("console.colType"), ""]}>
          {blocks.map((b) => (
            <tr key={b.id}>
              <td className="px-4 py-2.5">{b.startsAt.toLocaleString()}</td>
              <td className="px-4 py-2.5">{b.endsAt.toLocaleString()}</td>
              <td className="px-4 py-2.5">
                <Badge tone={b.kind === "BOOKING" ? "success" : "neutral"}>
                  {KIND_KEY[b.kind] ? t(KIND_KEY[b.kind]!) : b.kind}
                </Badge>
              </td>
              <td className="px-4 py-2.5 text-right">
                {b.kind !== "BOOKING" && <RemoveBlock blockId={b.id} label={t("console.removeCta")} />}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
