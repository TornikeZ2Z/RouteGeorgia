import { requireUser } from "@/lib/auth/session";
import { sql } from "@db/client";
import { getTranslator, isLocale, type Locale, type MessageKey } from "@/lib/i18n";
import { Alert, Badge, Card, EmptyState, Field, Input, PageHeader, Select, Table } from "@/components/ui";
import { ActionForm } from "@/components/form-state";
import { uploadDocumentAction } from "../actions";

export const dynamic = "force-dynamic";

/**
 * Identity and driving licence are what verification cannot start without.
 * Insurance is deliberately absent: the platform no longer collects it —
 * the signed agreement leaves the legal obligation with the driver.
 */
const REQUIRED = ["IDENTITY", "DRIVING_LICENSE"] as const;

const DOC_KEY: Record<string, MessageKey> = {
  IDENTITY: "console.docIDENTITY",
  DRIVING_LICENSE: "console.docDRIVING_LICENSE",
  VEHICLE_REGISTRATION: "console.docVEHICLE_REGISTRATION",
  INSURANCE: "console.docINSURANCE",
  INSPECTION: "console.docINSPECTION",
};

const STATE_KEY: Record<string, MessageKey> = {
  APPROVED: "console.dsAPPROVED", PENDING: "console.dsPENDING",
  CHANGES_REQUESTED: "console.dsCHANGES_REQUESTED", REJECTED: "console.dsREJECTED",
  EXPIRED: "console.dsEXPIRED",
};

export default async function DocumentsPage() {
  const user = await requireUser();
  const t = getTranslator(isLocale(user.locale) ? (user.locale as Locale) : "ka");
  const [driver] = await sql<{ id: string }[]>`SELECT id FROM driver_profiles WHERE user_id = ${user.id}::uuid`;
  if (!driver) return <EmptyState title={t("console.noProfileT")} />;

  const [docs, vehicles] = await Promise.all([
    sql<DocRow[]>`
      SELECT id, type::text AS type, state::text AS state, expires_on, review_reason, created_at
      FROM driver_documents WHERE driver_id = ${driver.id}::uuid ORDER BY created_at DESC`,
    sql<{ id: string; make: string; model: string }[]>`
      SELECT id, make, model FROM vehicles WHERE driver_id = ${driver.id}::uuid`,
  ]);

  const have = new Set(docs.map((d) => d.type));
  const missing = REQUIRED.filter((type) => !have.has(type));

  const docLabel = (type: string) => (DOC_KEY[type] ? t(DOC_KEY[type]) : type.toLowerCase());
  const stateLabel = (state: string) => (STATE_KEY[state] ? t(STATE_KEY[state]) : state.toLowerCase());

  return (
    <div className="space-y-6">
      <PageHeader title={t("console.docsTitle")} description={t("console.docsDesc")} />

      {missing.length > 0 && (
        <Alert tone="warning" title={t("console.stillRequiredT")}>
          {missing.map((type) => docLabel(type)).join(", ")}
        </Alert>
      )}

      {docs.length > 0 && (
        <Table head={[t("console.colDocument"), t("console.colExpires"), t("console.colStatus"), t("console.colReviewerNote")]}>
          {docs.map((d) => (
            <tr key={d.id}>
              <td className="px-4 py-2.5">{docLabel(d.type)}</td>
              <td className="px-4 py-2.5 tabular-nums">{d.expires_on ?? "—"}</td>
              <td className="px-4 py-2.5">
                <Badge tone={d.state === "APPROVED" ? "success" : d.state === "PENDING" ? "info" : "warning"}>
                  {stateLabel(d.state)}
                </Badge>
              </td>
              <td className="px-4 py-2.5 text-ink-600">{d.review_reason ?? "—"}</td>
            </tr>
          ))}
        </Table>
      )}

      <Card className="p-4 sm:p-6">
        <h2 className="mb-4 font-semibold text-ink-900">{t("console.uploadCta")}</h2>
        <ActionForm action={uploadDocumentAction} submitLabel={t("console.uploadCta")}>
          <Field label={t("console.docTypeL")} htmlFor="type" required>
            <Select id="type" name="type" required>
              <option value="IDENTITY">{t("console.docIDENTITY")}</option>
              <option value="DRIVING_LICENSE">{t("console.docDRIVING_LICENSE")}</option>
              <option value="VEHICLE_REGISTRATION">{t("console.docVEHICLE_REGISTRATION")}</option>
              <option value="INSPECTION">{t("console.docINSPECTION")}</option>
            </Select>
          </Field>

          <Field label={t("console.relatedVehicle")} htmlFor="vehicleId" hint={t("console.relatedVehicleHint")}>
            <Select id="vehicleId" name="vehicleId">
              <option value="">{t("console.notVehicleSpecific")}</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.make} {v.model}</option>)}
            </Select>
          </Field>

          <Field label={t("console.docNumberL")} htmlFor="number" hint={t("console.docNumberHint")}>
            <Input id="number" name="number" autoComplete="off" />
          </Field>

          <Field label={t("console.docExpiryL")} htmlFor="expiresOn" hint={t("console.docExpiryHint")}>
            <Input id="expiresOn" name="expiresOn" type="date" />
          </Field>

          <Field label={t("console.docFileL")} htmlFor="file" hint={t("console.docFileHint")} required>
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
