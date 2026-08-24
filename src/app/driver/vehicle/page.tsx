import { requireUser } from "@/lib/auth/session";
import { sql } from "@db/client";
import { getTranslator, isLocale, type Locale, type MessageKey } from "@/lib/i18n";
import { Badge, Card, EmptyState, Field, Input, PageHeader, Select, Table } from "@/components/ui";
import { ActionForm } from "@/components/form-state";
import { saveVehicleAction } from "../actions";
import { VehiclePhoto } from "@/components/vehicle-photo";
import { PhotoUploader, RemovePhoto } from "./photos";

export const dynamic = "force-dynamic";

const AMENITIES: [string, MessageKey][] = [
  ["air_conditioning", "console.amAC"], ["wifi", "console.amWifi"], ["pets_allowed", "console.amPets"],
  ["child_seat", "console.amChildSeat"], ["smoke_free", "console.amSmokeFree"],
];

const CAPABILITIES: [string, MessageKey][] = [
  ["four_wheel_drive", "console.cap4x4"], ["winter_tyres", "console.capWinter"],
  ["wheelchair_access", "console.capStepFree"],
];

const CLASS_KEY: Record<string, MessageKey> = {
  ECONOMY: "console.clsECONOMY", COMFORT: "console.clsCOMFORT", MINIVAN: "console.clsMINIVAN",
  SUV_4X4: "console.clsSUV_4X4", MINIBUS: "console.clsMINIBUS", PREMIUM: "console.clsPREMIUM",
};

export default async function VehiclePage() {
  const user = await requireUser();
  const t = getTranslator(isLocale(user.locale) ? (user.locale as Locale) : "ka");
  const [driver] = await sql<{ id: string }[]>`SELECT id FROM driver_profiles WHERE user_id = ${user.id}::uuid`;
  if (!driver) return <EmptyState title={t("console.noProfileT")} />;

  const list = await sql<VehicleRow[]>`
    SELECT id, make, model, year, color, plate, class::text AS class, seats, luggage,
           status::text AS status, published
    FROM vehicles WHERE driver_id = ${driver.id}::uuid ORDER BY created_at DESC`;

  const media = await sql<MediaRow[]>`
    SELECT vm.id, vm.vehicle_id, vm.storage_key, vm.moderation_state::text AS moderation_state, vm.alt_text
    FROM vehicle_media vm JOIN vehicles v ON v.id = vm.vehicle_id
    WHERE v.driver_id = ${driver.id}::uuid ORDER BY vm.position`;

  const classLabel = (value: string) => (CLASS_KEY[value] ? t(CLASS_KEY[value]) : value.toLowerCase());

  return (
    <div className="space-y-6">
      <PageHeader title={t("console.vehTitle")} description={t("console.vehDesc")} />

      {list.length > 0 && (
        <Table head={[t("console.colVehicle"), t("console.colPlate"), t("console.colClass"), t("console.colCapacity"), t("console.colStatus")]}>
          {list.map((v) => (
            <tr key={v.id}>
              <td className="px-4 py-2.5">{v.make} {v.model} · {v.year}</td>
              <td className="px-4 py-2.5 tabular-nums">{v.plate}</td>
              <td className="px-4 py-2.5">{classLabel(v.class)}</td>
              <td className="px-4 py-2.5">{t("console.capacityFmt", { seats: v.seats, bags: v.luggage })}</td>
              <td className="px-4 py-2.5">
                <Badge tone={v.published ? "success" : v.status === "SUBMITTED" ? "info" : "neutral"}>
                  {v.published ? t("console.vehPublished") : t(("console.st" + v.status) as MessageKey)}
                </Badge>
              </td>
            </tr>
          ))}
        </Table>
      )}

      {list.length > 0 && (
        <Card className="p-4 sm:p-6">
          <h2 className="font-semibold text-ink-900">{t("console.photosT")}</h2>
          <p className="mt-1 text-sm text-ink-600">{t("console.photosB")}</p>

          {list.map((v) => {
            const shots = media.filter((m) => m.vehicle_id === v.id);
            return (
              <section key={v.id} className="mt-5 border-t border-ink-100 pt-4 first:border-0 first:pt-0">
                <p className="text-sm font-medium text-ink-800">{v.make} {v.model}</p>
                {shots.length === 0 ? (
                  <p className="mt-2 text-sm text-ink-500">{t("console.noPhotos")}</p>
                ) : (
                  <ul className="mt-3 flex flex-wrap gap-3">
                    {shots.map((m) => (
                      <li key={m.id} className="w-36">
                        <VehiclePhoto
                          photoKey={m.moderation_state === "APPROVED" ? m.storage_key : null}
                          colour={v.color}
                          alt={m.alt_text ?? `${v.make} ${v.model}`}
                          className="h-24 w-36"
                        />
                        <div className="mt-1 flex items-center justify-between gap-1">
                          <Badge tone={m.moderation_state === "APPROVED" ? "success" : m.moderation_state === "REJECTED" ? "danger" : "info"}>
                            {m.moderation_state === "APPROVED" ? t("console.dsAPPROVED")
                              : m.moderation_state === "REJECTED" ? t("console.dsREJECTED") : t("console.dsPENDING")}
                          </Badge>
                          <RemovePhoto mediaId={m.id} label={t("console.removeCta")} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}

          <div className="mt-6 border-t border-ink-100 pt-4">
            <PhotoUploader
              vehicles={list.map((v) => ({ id: v.id, label: `${v.make} ${v.model}` }))}
              labels={{
                title: t("console.phUploadT"), vehicle: t("console.vehicleL"), show: t("console.phShow"),
                exterior: t("console.phExterior"), interior: t("console.phInterior"),
                rearSeats: t("console.phRearSeats"), luggage: t("console.phLuggage"),
                desc: t("console.phDescL"), descHint: t("console.phDescHint"),
                photos: t("console.phPhotosL"), photosHint: t("console.phPhotosHint"),
                upload: t("console.uploadCta"),
              }}
            />
          </div>
        </Card>
      )}

      <Card className="p-4 sm:p-6">
        <h2 className="mb-4 font-semibold text-ink-900">{t("console.addVehicleT")}</h2>
        <ActionForm action={saveVehicleAction} submitLabel={t("console.submitVehicleCta")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("console.makeL")} htmlFor="make" required><Input id="make" name="make" required /></Field>
            <Field label={t("console.modelL")} htmlFor="model" required><Input id="model" name="model" required /></Field>
            <Field label={t("console.yearL")} htmlFor="year" required>
              <Input id="year" name="year" type="number" min={1990} max={2100} required />
            </Field>
            <Field label={t("console.colourL")} htmlFor="color"><Input id="color" name="color" /></Field>
            <Field label={t("console.plateL")} htmlFor="plate" required><Input id="plate" name="plate" required /></Field>
            <Field label={t("console.classL")} htmlFor="class" required>
              <Select id="class" name="class" required>
                {Object.keys(CLASS_KEY).map((value) => (
                  <option key={value} value={value}>{classLabel(value)}</option>
                ))}
              </Select>
            </Field>
            <Field label={t("console.seatsL")} htmlFor="seats" hint={t("console.seatsHint")} required>
              <Input id="seats" name="seats" type="number" min={1} max={60} required />
            </Field>
            <Field label={t("console.luggageL")} htmlFor="luggage" hint={t("console.luggageHint")} required>
              <Input id="luggage" name="luggage" type="number" min={0} max={60} required />
            </Field>
          </div>

          <fieldset className="rounded-lg border border-ink-200 p-3">
            <legend className="px-1 text-sm font-medium text-ink-700">{t("console.amenitiesT")}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {AMENITIES.map(([name, key]) => (
                <label key={name} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name={name} className="size-4 rounded" /> {t(key)}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="rounded-lg border border-ink-200 p-3">
            <legend className="px-1 text-sm font-medium text-ink-700">{t("console.safetyT")}</legend>
            <p className="mb-2 text-xs text-ink-500">{t("console.safetyB")}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {CAPABILITIES.map(([name, key]) => (
                <label key={name} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name={name} className="size-4 rounded" /> {t(key)}
                </label>
              ))}
            </div>
          </fieldset>
        </ActionForm>
      </Card>
    </div>
  );
}

interface VehicleRow {
  id: string; make: string; model: string; year: number; color: string | null; plate: string;
  class: string; seats: number; luggage: number; status: string; published: boolean;
}
interface MediaRow {
  id: string; vehicle_id: string; storage_key: string; moderation_state: string; alt_text: string | null;
}
