import { requireUser } from "@/lib/auth/session";
import { sql } from "@db/client";
import { Alert, Badge, Card, EmptyState, Field, Input, PageHeader, Select, Table } from "@/components/ui";
import { ActionForm } from "@/components/form-state";
import { uploadDocumentAction } from "../actions";

export const dynamic = "force-dynamic";

const REQUIRED = ["IDENTITY", "DRIVING_LICENSE", "INSURANCE"] as const;

export default async function DocumentsPage() {
  const user = await requireUser();
  const [driver] = await sql<{ id: string }[]>`SELECT id FROM driver_profiles WHERE user_id = ${user.id}::uuid`;
  if (!driver) return <EmptyState title="Create your profile first" />;

  const [docs, vehicles] = await Promise.all([
    sql<DocRow[]>`
      SELECT id, type::text AS type, state::text AS state, expires_on, review_reason, created_at
      FROM driver_documents WHERE driver_id = ${driver.id}::uuid ORDER BY created_at DESC`,
    sql<{ id: string; make: string; model: string }[]>`
      SELECT id, make, model FROM vehicles WHERE driver_id = ${driver.id}::uuid`,
  ]);

  const have = new Set(docs.map((d) => d.type));
  const missing = REQUIRED.filter((t) => !have.has(t));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Documents"
        description="Uploads are stored in restricted storage and only reviewers can open them."
      />

      {missing.length > 0 && (
        <Alert tone="warning" title="Still required">
          {missing.map((m) => m.replaceAll("_", " ").toLowerCase()).join(", ")}
        </Alert>
      )}

      <Alert tone="info" title="Insurance must cover paying passengers">
        A standard private motor policy usually excludes carrying passengers for payment. Upload a policy
        that explicitly covers commercial passenger transport, or your profile cannot be published.
      </Alert>

      {docs.length > 0 && (
        <Table head={["Document", "Expires", "Status", "Reviewer note"]}>
          {docs.map((d) => (
            <tr key={d.id}>
              <td className="px-4 py-2.5">{d.type.replaceAll("_", " ").toLowerCase()}</td>
              <td className="px-4 py-2.5 tabular-nums">{d.expires_on ?? "—"}</td>
              <td className="px-4 py-2.5">
                <Badge tone={d.state === "APPROVED" ? "success" : d.state === "PENDING" ? "info" : "warning"}>
                  {d.state}
                </Badge>
              </td>
              <td className="px-4 py-2.5 text-ink-600">{d.review_reason ?? "—"}</td>
            </tr>
          ))}
        </Table>
      )}

      <Card className="p-4 sm:p-6">
        <h2 className="mb-4 font-semibold text-ink-900">Upload a document</h2>
        <ActionForm action={uploadDocumentAction} submitLabel="Upload">
          <Field label="Document type" htmlFor="type" required>
            <Select id="type" name="type" required>
              <option value="IDENTITY">Identity document</option>
              <option value="DRIVING_LICENSE">Driving licence</option>
              <option value="VEHICLE_REGISTRATION">Vehicle registration</option>
              <option value="INSURANCE">Insurance (passenger cover)</option>
              <option value="INSPECTION">Technical inspection</option>
            </Select>
          </Field>

          <Field label="Related vehicle" htmlFor="vehicleId" hint="Only for registration, insurance and inspection.">
            <Select id="vehicleId" name="vehicleId">
              <option value="">Not vehicle specific</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.make} {v.model}</option>)}
            </Select>
          </Field>

          <Field label="Document number" htmlFor="number" hint="Stored as a one-way hash, used only to detect duplicates.">
            <Input id="number" name="number" autoComplete="off" />
          </Field>

          <Field label="Expiry date" htmlFor="expiresOn" hint="Required for licence and insurance.">
            <Input id="expiresOn" name="expiresOn" type="date" />
          </Field>

          <Field label="File" htmlFor="file" hint="JPEG, PNG, WebP or PDF, up to 12 MB." required>
            <Input id="file" name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required />
          </Field>
        </ActionForm>
      </Card>
    </div>
  );
}

interface DocRow {
  id: string; type: string; state: string; expires_on: string | null;
  review_reason: string | null; created_at: Date;
}
