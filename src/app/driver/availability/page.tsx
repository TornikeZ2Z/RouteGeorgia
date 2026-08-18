import { requireUser } from "@/lib/auth/session";
import { sql } from "@db/client";
import { listBlocks } from "@/lib/availability";
import { Alert, Badge, Card, EmptyState, Field, Input, PageHeader, Select, Table } from "@/components/ui";
import { ActionForm } from "@/components/form-state";
import { addAvailabilityBlockAction } from "../actions";
import { RemoveBlock } from "./remove";

export const dynamic = "force-dynamic";

export default async function AvailabilityPage() {
  const user = await requireUser();
  const [driver] = await sql<{ id: string }[]>`SELECT id FROM driver_profiles WHERE user_id = ${user.id}::uuid`;
  if (!driver) return <EmptyState title="Create your profile first" />;

  const from = new Date();
  const to = new Date(Date.now() + 60 * 86_400_000);
  const blocks = await listBlocks(driver.id, from, to);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Availability"
        description="You are considered available unless a block says otherwise."
      />

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
