import { requireUser } from "@/lib/auth/session";
import { sql } from "@db/client";
import { getTranslator, isLocale, type Locale } from "@/lib/i18n";
import { PageHeader, Field, Input, Textarea, Select, Card } from "@/components/ui";
import { ActionForm } from "@/components/form-state";
import { saveProfileAction } from "../actions";
import { SubmitApplication } from "./submit";

export const dynamic = "force-dynamic";

export default async function ApplicationPage() {
  const user = await requireUser();
  const t = getTranslator(isLocale(user.locale) ? (user.locale as Locale) : "ka");
  const [driver] = await sql<DriverRow[]>`
    SELECT id, public_name, legal_first_name, legal_last_name, bio, base_location_id,
           emergency_contact, status::text AS status
    FROM driver_profiles WHERE user_id = ${user.id}::uuid`;

  const [locations, languages] = await Promise.all([
    sql<{ id: string; name_en: string; name_ka: string | null }[]>`
      SELECT id, name_en, name_ka FROM locations ORDER BY name_en`,
    driver
      ? sql<{ language: string; declared_level: string }[]>`
          SELECT language, declared_level::text FROM driver_languages WHERE driver_id = ${driver.id}::uuid`
      : Promise.resolve([]),
  ]);

  const languageValue = languages.map((l) => `${l.language}:${l.declared_level}`).join(",");
  const placeName = (l: (typeof locations)[number]) =>
    (user.locale === "ka" ? l.name_ka : l.name_en) || l.name_en;

  return (
    <div className="space-y-6">
      <PageHeader title={t("console.profTitle")} description={t("console.profDesc")} />

      <Card className="p-4 sm:p-6">
        <ActionForm action={saveProfileAction} submitLabel={t("console.saveProfileCta")}>
          <Field label={t("console.dispNameL")} htmlFor="publicName" hint={t("console.dispNameHint")} required>
            <Input id="publicName" name="publicName" defaultValue={driver?.public_name ?? ""} required />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("console.legalFirstL")} htmlFor="legalFirstName" required>
              <Input id="legalFirstName" name="legalFirstName" defaultValue={driver?.legal_first_name ?? ""} required />
            </Field>
            <Field label={t("console.legalLastL")} htmlFor="legalLastName" required>
              <Input id="legalLastName" name="legalLastName" defaultValue={driver?.legal_last_name ?? ""} required />
            </Field>
          </div>

          <Field label={t("console.baseL")} htmlFor="baseLocationId">
            <Select id="baseLocationId" name="baseLocationId" defaultValue={driver?.base_location_id ?? ""}>
              <option value="">{t("console.notSetOpt")}</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{placeName(l)}</option>)}
            </Select>
          </Field>

          <Field label={t("console.langsL")} htmlFor="languages" hint={t("console.langsHint")}>
            <Input id="languages" name="languages" defaultValue={languageValue} placeholder="en:FLUENT,ka:NATIVE" />
          </Field>

          <Field label={t("console.bioL")} htmlFor="bio" hint={t("console.bioHint")}>
            <Textarea id="bio" name="bio" rows={4} defaultValue={driver?.bio ?? ""} />
          </Field>

          <Field label={t("console.emergL")} htmlFor="emergencyContact" hint={t("console.emergHint")}>
            <Input id="emergencyContact" name="emergencyContact" defaultValue={driver?.emergency_contact ?? ""} />
          </Field>
        </ActionForm>
      </Card>

      {driver && ["DRAFT", "CHANGES_REQUESTED"].includes(driver.status) && (
        <SubmitApplication labels={{
          title: t("console.subT"), body: t("console.subB"),
          cta: t("console.subCta"), pending: t("console.subPending"),
        }} />
      )}
    </div>
  );
}

interface DriverRow {
  id: string; public_name: string; legal_first_name: string | null; legal_last_name: string | null;
  bio: string | null; base_location_id: string | null; emergency_contact: string | null; status: string;
}
