import { requireUser } from "@/lib/auth/session";
import { sql } from "@db/client";
import { PageHeader, Field, Input, Textarea, Select, Card } from "@/components/ui";
import { ActionForm } from "@/components/form-state";
import { saveProfileAction } from "../actions";
import { SubmitApplication } from "./submit";

export const dynamic = "force-dynamic";

export default async function ApplicationPage() {
  const user = await requireUser();
  const [driver] = await sql<DriverRow[]>`
    SELECT id, public_name, legal_first_name, legal_last_name, bio, base_location_id,
           emergency_contact, status::text AS status
    FROM driver_profiles WHERE user_id = ${user.id}::uuid`;

  const [locations, languages] = await Promise.all([
    sql<{ id: string; name_en: string }[]>`SELECT id, name_en FROM locations ORDER BY name_en`,
    driver
      ? sql<{ language: string; declared_level: string }[]>`
          SELECT language, declared_level::text FROM driver_languages WHERE driver_id = ${driver.id}::uuid`
      : Promise.resolve([]),
  ]);

  const languageValue = languages.map((l) => `${l.language}:${l.declared_level}`).join(",");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Your profile"
        description="This is what travellers see, alongside your verified documents."
      />

      <Card className="p-4 sm:p-6">
        <ActionForm action={saveProfileAction} submitLabel="Save profile">
          <Field label="Display name" htmlFor="publicName" hint="Shown publicly, e.g. “Giorgi K.”" required>
            <Input id="publicName" name="publicName" defaultValue={driver?.public_name ?? ""} required />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Legal first name" htmlFor="legalFirstName" required>
              <Input id="legalFirstName" name="legalFirstName" defaultValue={driver?.legal_first_name ?? ""} required />
            </Field>
            <Field label="Legal last name" htmlFor="legalLastName" required>
              <Input id="legalLastName" name="legalLastName" defaultValue={driver?.legal_last_name ?? ""} required />
            </Field>
          </div>

          <Field label="Base location" htmlFor="baseLocationId">
            <Select id="baseLocationId" name="baseLocationId" defaultValue={driver?.base_location_id ?? ""}>
              <option value="">Not set</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name_en}</option>)}
            </Select>
          </Field>

          <Field
            label="Languages"
            htmlFor="languages"
            hint="Format: en:FLUENT,ka:NATIVE,ru:CONVERSATIONAL. Levels are self-declared until an interview verifies them."
          >
            <Input id="languages" name="languages" defaultValue={languageValue} placeholder="en:FLUENT,ka:NATIVE" />
          </Field>

          <Field label="About you" htmlFor="bio" hint="Two or three sentences. No phone numbers or personal contact details.">
            <Textarea id="bio" name="bio" rows={4} defaultValue={driver?.bio ?? ""} />
          </Field>

          <Field label="Emergency contact" htmlFor="emergencyContact" hint="Used only in a safety incident. Never shown to travellers.">
            <Input id="emergencyContact" name="emergencyContact" defaultValue={driver?.emergency_contact ?? ""} />
          </Field>
        </ActionForm>
      </Card>

      {driver && ["DRAFT", "CHANGES_REQUESTED"].includes(driver.status) && <SubmitApplication />}
    </div>
  );
}

interface DriverRow {
  id: string; public_name: string; legal_first_name: string | null; legal_last_name: string | null;
  bio: string | null; base_location_id: string | null; emergency_contact: string | null; status: string;
}
