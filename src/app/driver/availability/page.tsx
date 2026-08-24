import { requireUser } from "@/lib/auth/session";
import { sql } from "@db/client";
import { listBlocks } from "@/lib/availability";
import { Alert, Badge, Card, EmptyState, Field, Input, PageHeader, Select, Table } from "@/components/ui";
import { ActionForm } from "@/components/form-state";
import { addAvailabilityBlockAction } from "../actions";
import { WorkDayCalendar } from "./workdays";
import { RemoveBlock } from "./remove";

export const dynamic = "force-dynamic";

export default async function AvailabilityPage() {
  const user = await requireUser();
  const [driver] = await sql<{ id: string }[]>`SELECT id FROM driver_profiles WHERE user_id = ${user.id}::uuid`;
  if (!driver) return <EmptyState title="Create your profile first" />;

  const from = new Date();
  const to = new Date(Date.now() + 60 * 86_400_000);
  const blocks = await listBlocks(driver.id, from, to);

  // Working-days grid, resolved in Georgian time (UTC+4, no DST).
  const TB = 4 * 3600_000;
  const dayKey = (d: Date) => new Date(d.getTime() + TB).toISOString().slice(0, 10);
  const todayStart = new Date(`${dayKey(new Date())}T00:00:00+04:00`);
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
      month: inTbilisi.toLocaleString("en", { month: "short", timeZone: "UTC" }),
      state,
    };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Availability"
        description="You are considered available unless a block says otherwise."
      />

      <Card className="p-4 sm:p-6">
        <h2 className="font-semibold text-ink-900">Working days</h2>
        <p className="mt-1 text-sm text-ink-500">
          Tap a day to switch it on or off. Travellers only see you in search results on days you work.
          Days with a confirmed booking are locked.
        </p>
        <WorkDayCalendar days={days} />
      </Card>

      <Alert tone="info" title="How blocking works">
        A confirmed booking blocks your calendar for the driving time plus a 45-minute preparation buffer
        and a 30-minute buffer afterwards, so you are never sold two overlapping trips. You cannot delete a
        booking block yourself — contact support if you need a booking changed.
      </Alert>

      <Card className="p-4 sm:p-6">
        <h2 className="mb-4 font-semibold text-ink-900">Block time off</h2>
        <ActionForm action={addAvailabilityBlockAction} submitLabel="Add block">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="From" htmlFor="startsAt" required>
              <Input id="startsAt" name="startsAt" type="datetime-local" required />
            </Field>
            <Field label="To" htmlFor="endsAt" required>
              <Input id="endsAt" name="endsAt" type="datetime-local" required />
            </Field>
            <Field label="Reason" htmlFor="kind" hint="Not shown to travellers.">
              <Select id="kind" name="kind" defaultValue="TIME_OFF">
                <option value="TIME_OFF">Time off</option>
                <option value="BUSY">Busy with other work</option>
              </Select>
            </Field>
          </div>
        </ActionForm>
      </Card>

      {blocks.length === 0 ? (
        <EmptyState title="Your calendar is clear for the next 60 days" />
      ) : (
        <Table head={["From", "To", "Type", ""]}>
          {blocks.map((b) => (
            <tr key={b.id}>
              <td className="px-4 py-2.5">{b.startsAt.toLocaleString()}</td>
              <td className="px-4 py-2.5">{b.endsAt.toLocaleString()}</td>
              <td className="px-4 py-2.5">
                <Badge tone={b.kind === "BOOKING" ? "success" : "neutral"}>{b.kind.replaceAll("_", " ")}</Badge>
              </td>
              <td className="px-4 py-2.5 text-right">
                {b.kind !== "BOOKING" && <RemoveBlock blockId={b.id} />}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
