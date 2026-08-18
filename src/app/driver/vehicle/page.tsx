import { requireUser } from "@/lib/auth/session";
import { sql } from "@db/client";
import { Badge, Card, EmptyState, Field, Input, PageHeader, Select, Table } from "@/components/ui";
import { ActionForm } from "@/components/form-state";
import { saveVehicleAction } from "../actions";
import { VehiclePhoto } from "@/components/vehicle-photo";
import { PhotoUploader, RemovePhoto } from "./photos";

export const dynamic = "force-dynamic";

const AMENITIES = [
  ["air_conditioning", "Air conditioning"], ["wifi", "Wi-Fi"], ["pets_allowed", "Pets allowed"],
  ["child_seat", "Child seat available"], ["smoke_free", "Smoke free"],
] as const;

const CAPABILITIES = [
  ["four_wheel_drive", "4x4"], ["winter_tyres", "Winter tyres"], ["wheelchair_access", "Step-free access"],
] as const;

export default async function VehiclePage() {
  const user = await requireUser();
  const [driver] = await sql<{ id: string }[]>`SELECT id FROM driver_profiles WHERE user_id = ${user.id}::uuid`;
  if (!driver) return <EmptyState title="Create your profile first" />;

  const list = await sql<VehicleRow[]>`
    SELECT id, make, model, year, color, plate, class::text AS class, seats, luggage,
           status::text AS status, published
    FROM vehicles WHERE driver_id = ${driver.id}::uuid ORDER BY created_at DESC`;

  const media = await sql<MediaRow[]>`
    SELECT vm.id, vm.vehicle_id, vm.storage_key, vm.moderation_state::text AS moderation_state, vm.alt_text
    FROM vehicle_media vm JOIN vehicles v ON v.id = vm.vehicle_id
    WHERE v.driver_id = ${driver.id}::uuid ORDER BY vm.position`;

  return (
    <div className="space-y-6">
      <PageHeader title="Vehicles" description="Each vehicle is reviewed and published separately." />

      {list.length > 0 && (
        <Table head={["Vehicle", "Plate", "Class", "Capacity", "Status"]}>
          {list.map((v) => (
            <tr key={v.id}>
              <td className="px-4 py-2.5">{v.make} {v.model} · {v.year}</td>
              <td className="px-4 py-2.5 tabular-nums">{v.plate}</td>
              <td className="px-4 py-2.5">{v.class.replaceAll("_", " ").toLowerCase()}</td>
              <td className="px-4 py-2.5">{v.seats} seats · {v.luggage} bags</td>
              <td className="px-4 py-2.5">
                <Badge tone={v.published ? "success" : v.status === "SUBMITTED" ? "info" : "neutral"}>
                  {v.published ? "Published" : v.status}
                </Badge>
              </td>
            </tr>
          ))}
        </Table>
      )}

      {list.length > 0 && (
        <Card className="p-4 sm:p-6">
          <h2 className="font-semibold text-ink-900">Photos</h2>
          <p className="mt-1 text-sm text-ink-600">
            Travellers choose a specific car, so real photos of your own vehicle matter more than
            anything else on your profile. Photos are reviewed before they appear publicly.
          </p>

          {list.map((v) => {
            const shots = media.filter((m) => m.vehicle_id === v.id);
            return (
              <section key={v.id} className="mt-5 border-t border-ink-100 pt-4 first:border-0 first:pt-0">
                <p className="text-sm font-medium text-ink-800">{v.make} {v.model}</p>
                {shots.length === 0 ? (
                  <p className="mt-2 text-sm text-ink-500">No photos yet.</p>
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
                            {m.moderation_state.toLowerCase()}
                          </Badge>
                          <RemovePhoto mediaId={m.id} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}

          <div className="mt-6 border-t border-ink-100 pt-4">
            <PhotoUploader vehicles={list.map((v) => ({ id: v.id, label: `${v.make} ${v.model}` }))} />
          </div>
        </Card>
      )}

      <Card className="p-4 sm:p-6">
        <h2 className="mb-4 font-semibold text-ink-900">Add a vehicle</h2>
        <ActionForm action={saveVehicleAction} submitLabel="Submit vehicle">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Make" htmlFor="make" required><Input id="make" name="make" required /></Field>
            <Field label="Model" htmlFor="model" required><Input id="model" name="model" required /></Field>
            <Field label="Year" htmlFor="year" required>
              <Input id="year" name="year" type="number" min={1990} max={2100} required />
            </Field>
            <Field label="Colour" htmlFor="color"><Input id="color" name="color" /></Field>
            <Field label="Number plate" htmlFor="plate" required><Input id="plate" name="plate" required /></Field>
            <Field label="Class" htmlFor="class" required>
              <Select id="class" name="class" required>
                <option value="ECONOMY">Economy</option>
                <option value="COMFORT">Comfort</option>
                <option value="MINIVAN">Minivan</option>
                <option value="SUV_4X4">SUV / 4x4</option>
                <option value="MINIBUS">Minibus</option>
                <option value="PREMIUM">Premium</option>
              </Select>
            </Field>
            <Field label="Passenger seats" htmlFor="seats" hint="Excluding the driver" required>
              <Input id="seats" name="seats" type="number" min={1} max={60} required />
            </Field>
            <Field label="Luggage capacity" htmlFor="luggage" hint="Large bags" required>
              <Input id="luggage" name="luggage" type="number" min={0} max={60} required />
            </Field>
          </div>

          <fieldset className="rounded-lg border border-ink-200 p-3">
            <legend className="px-1 text-sm font-medium text-ink-700">Amenities</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {AMENITIES.map(([name, label]) => (
                <label key={name} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name={name} className="size-4 rounded" /> {label}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="rounded-lg border border-ink-200 p-3">
            <legend className="px-1 text-sm font-medium text-ink-700">
              Safety and capability
            </legend>
            <p className="mb-2 text-xs text-ink-500">
              These control which routes you can be offered. Mountain routes require 4x4 and winter tyres.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {CAPABILITIES.map(([name, label]) => (
                <label key={name} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name={name} className="size-4 rounded" /> {label}
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
