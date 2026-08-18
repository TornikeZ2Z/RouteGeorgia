import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { sql } from "@db/client";
import { EmptyState, PageHeader } from "@/components/ui";
import { VehiclePhoto } from "@/components/vehicle-photo";
import { MediaDecision } from "./decision";

export const dynamic = "force-dynamic";

/**
 * Photo moderation queue. Vehicle photos are the most persuasive thing on a
 * driver profile and the easiest thing to fake, so nothing reaches travellers
 * without a human looking at it.
 */
export default async function MediaQueue() {
  await requirePermission("admin.drivers.decide");

  const rows = await sql<Row[]>`
    SELECT vm.id, vm.storage_key, vm.alt_text, vm.view_type, vm.created_at,
           v.make, v.model, v.color, v.plate,
           d.id AS driver_id, d.public_name
    FROM vehicle_media vm
    JOIN vehicles v ON v.id = vm.vehicle_id
    JOIN driver_profiles d ON d.id = v.driver_id
    WHERE vm.moderation_state = 'PENDING'
    ORDER BY vm.created_at
    LIMIT 60`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Photo moderation"
        description={`${rows.length} photo(s) waiting. Reject anything that is not the registered vehicle, or that shows faces, other cars' plates, or contact details.`}
      />

      {rows.length === 0 ? (
        <EmptyState title="Nothing waiting for moderation" />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((m) => (
            <li key={m.id} className="rounded-xl border border-ink-200 bg-white p-3">
              {/* Pending photos are shown to the moderator by direct key —
                  they are not public until approved. */}
              <VehiclePhoto
                photoKey={m.storage_key} colour={m.color}
                alt={m.alt_text ?? `${m.make} ${m.model}`} className="h-40 w-full"
              />
              <p className="mt-2 text-sm font-medium text-ink-900">{m.make} {m.model}</p>
              <p className="text-xs text-ink-500">
                {m.plate} · {m.view_type ?? "unspecified view"}
              </p>
              <Link href={`/admin/drivers/${m.driver_id}`} className="text-xs text-brand-700 underline">
                {m.public_name}
              </Link>
              {m.alt_text && <p className="mt-1 text-xs text-ink-500">“{m.alt_text}”</p>}
              <div className="mt-3">
                <MediaDecision mediaId={m.id} driverId={m.driver_id} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface Row {
  id: string; storage_key: string; alt_text: string | null; view_type: string | null; created_at: Date;
  make: string; model: string; color: string | null; plate: string;
  driver_id: string; public_name: string;
}
