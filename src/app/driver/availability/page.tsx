import { requireUser } from "@/lib/auth/session";
import { sql } from "@db/client";
import { listBlocks } from "@/lib/availability";
import { getTranslator, isLocale, type Locale, type MessageKey } from "@/lib/i18n";
import { Alert, Badge, Card, EmptyState, Field, Input, PageHeader, Select, Table } from "@/components/ui";
import { ActionForm } from "@/components/form-state";
import { addAvailabilityBlockAction } from "../actions";
import { WorkDayCalendar } from "./workdays";
import { RemoveBlock } from "./remove";

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

  const from = new Date();
  const to = new Date(Date.now() + 60 * 86_400_000);
  const blocks = await listBlocks(driver.id, from, to);

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
    const state = overlapping.some((b) => b.kind === "BOOKING" || b.kind === "REST_BUFFER")
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

  return (
    <div className="space-y-6">
      <PageHeader title={t("console.availTitle")} description={t("console.availDesc")} />

      <Card className="p-4 sm:p-6">
        <h2 className="font-semibold text-ink-900">{t("console.workDaysT")}</h2>
        <p className="mt-1 text-sm text-ink-500">{t("console.workDaysB")}</p>
        <WorkDayCalendar days={days} />
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
