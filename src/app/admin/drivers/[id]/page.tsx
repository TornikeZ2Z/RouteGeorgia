import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/rbac";
import { sql } from "@db/client";
import { Alert, Badge, Card, PageHeader, Table } from "@/components/ui";
import { DecisionPanel, DocumentDecision, VehicleDecision, LanguageVerification, PublishPanel, UploadDocumentPanel } from "./panels";
import { WalletPanel } from "../forms";
import { driverBalance } from "@/lib/ledger";
import { can as canDo } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function DriverDetail({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePermission("admin.drivers.read");
  const { id } = await params;

  const [driver] = await sql<DriverRow[]>`
    SELECT d.id, d.public_name, d.handle, d.legal_first_name, d.legal_last_name, d.bio,
           d.status::text AS status, d.published, d.submitted_at, d.suspended_reason,
           u.email, u.phone, l.name_en AS base_location
    FROM driver_profiles d
    JOIN users u ON u.id = d.user_id
    LEFT JOIN locations l ON l.id = d.base_location_id
    WHERE d.id = ${id}::uuid`;
  if (!driver) notFound();

  const [docs, vehicleRows, languages, decisions] = await Promise.all([
    sql<DocRow[]>`
      SELECT id, type::text AS type, state::text AS state, expires_on, review_reason, created_at
      FROM driver_documents WHERE driver_id = ${id}::uuid ORDER BY type`,
    sql<VehicleRow[]>`
      SELECT id, make, model, year, plate, class::text AS class, seats, luggage,
             status::text AS status, published, capabilities
      FROM vehicles WHERE driver_id = ${id}::uuid`,
    sql<LangRow[]>`
      SELECT language, declared_level::text AS declared_level, verified_level::text AS verified_level
      FROM driver_languages WHERE driver_id = ${id}::uuid ORDER BY language`,
    sql<DecisionRow[]>`
      SELECT from_state::text, to_state::text, reason, created_at
      FROM driver_decisions WHERE driver_id = ${id}::uuid ORDER BY created_at DESC LIMIT 20`,
  ]);

  const balance = canDo(actor.roles, "admin.finance.read") ? await driverBalance(id) : null;
  const mayDecide = can(actor.roles, "admin.drivers.decide");
  const mayPublish = can(actor.roles, "admin.drivers.publish");
  const mayDecideDocs = can(actor.roles, "admin.documents.decide");

  return (
    <div className="space-y-6">
      <PageHeader
        title={driver.public_name}
        description={`${driver.legal_first_name ?? ""} ${driver.legal_last_name ?? ""} · ${driver.email}`}
        actions={
          <>
            <Badge tone={driver.status === "APPROVED" ? "success" : "info"}>{driver.status}</Badge>
            {driver.published && <Badge tone="success">Live</Badge>}
          </>
        }
      />

      {driver.suspended_reason && (
        <Alert tone="danger" title="Suspended">{driver.suspended_reason}</Alert>
      )}

      {!mayDecide && (
        <Alert tone="info">
          Your role can read this record but not decide on it. Decisions require an operations manager.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section>
            <h2 className="mb-2 font-semibold text-ink-900">Documents</h2>
            <Table head={["Type", "Expires", "State", "Note", ...(mayDecideDocs ? ["Decision"] : [])]}>
              {docs.map((d) => (
                <tr key={d.id}>
                  <td className="px-4 py-2.5">
                    {canDo(actor.roles, "admin.documents.read") ? (
                      <a href={`/api/admin/documents/${d.id}`} target="_blank" rel="noreferrer"
                         className="text-ink-900 underline">
                        {d.type.replaceAll("_", " ").toLowerCase()}
                      </a>
                    ) : d.type.replaceAll("_", " ").toLowerCase()}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums">
                    {d.expires_on ?? "—"}
                    {d.expires_on && new Date(d.expires_on) < new Date() && (
                      <span className="ml-2 text-xs text-[--color-danger]">expired</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone={d.state === "APPROVED" ? "success" : d.state === "PENDING" ? "info" : "warning"}>
                      {d.state}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-ink-600">{d.review_reason ?? "—"}</td>
                  {mayDecideDocs && (
                    <td className="px-4 py-2.5">
                      <DocumentDecision documentId={d.id} driverId={driver.id} />
                    </td>
                  )}
                </tr>
              ))}
            </Table>
            {mayDecideDocs && (
              <div className="mt-4">
                <UploadDocumentPanel
                  driverId={driver.id}
                  vehicles={vehicleRows.map((v) => ({ id: v.id, label: `${v.make} ${v.model} (${v.plate ?? v.year})` }))}
                />
              </div>
            )}
            <p className="mt-2 text-xs text-ink-500">
              Files are streamed from restricted storage, never linked directly. Every time a reviewer
              opens one it is written to the audit log.
            </p>
          </section>

          <section>
            <h2 className="mb-2 font-semibold text-ink-900">Vehicles</h2>
            <Table head={["Vehicle", "Plate", "Class", "Capacity", "4x4", "State", ...(mayDecide ? ["Decision"] : [])]}>
              {vehicleRows.map((v) => (
                <tr key={v.id}>
                  <td className="px-4 py-2.5">{v.make} {v.model} · {v.year}</td>
                  <td className="px-4 py-2.5 tabular-nums">{v.plate}</td>
                  <td className="px-4 py-2.5">{v.class.replaceAll("_", " ").toLowerCase()}</td>
                  <td className="px-4 py-2.5">{v.seats}/{v.luggage}</td>
                  <td className="px-4 py-2.5">
                    {(v.capabilities as Record<string, boolean>)?.four_wheel_drive ? "yes" : "no"}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone={v.published ? "success" : "neutral"}>{v.published ? "Published" : v.status}</Badge>
                  </td>
                  {mayDecide && (
                    <td className="px-4 py-2.5">
                      <VehicleDecision vehicleId={v.id} driverId={driver.id} />
                    </td>
                  )}
                </tr>
              ))}
            </Table>
          </section>

          <section>
            <h2 className="mb-2 font-semibold text-ink-900">Languages</h2>
            <Table head={["Language", "Declared", "Verified", ...(mayDecide ? ["Record interview"] : [])]}>
              {languages.map((l) => (
                <tr key={l.language}>
                  <td className="px-4 py-2.5">{l.language}</td>
                  <td className="px-4 py-2.5">{l.declared_level.toLowerCase()}</td>
                  <td className="px-4 py-2.5">
                    {l.verified_level
                      ? <Badge tone="success">{l.verified_level.toLowerCase()}</Badge>
                      : <Badge tone="warning">unverified</Badge>}
                  </td>
                  {mayDecide && (
                    <td className="px-4 py-2.5">
                      <LanguageVerification driverId={driver.id} language={l.language} />
                    </td>
                  )}
                </tr>
              ))}
            </Table>
          </section>

          <section>
            <h2 className="mb-2 font-semibold text-ink-900">Decision history</h2>
            {decisions.length === 0 ? (
              <p className="text-sm text-ink-500">No decisions recorded yet.</p>
            ) : (
              <ul className="space-y-2">
                {decisions.map((d, i) => (
                  <li key={i} className="rounded-lg border border-ink-200 bg-white px-4 py-3 text-sm">
                    <p>
                      <span className="text-ink-500">{d.from_state}</span> →{" "}
                      <span className="font-medium">{d.to_state}</span>
                      <span className="ml-2 text-xs text-ink-500">
                        {new Date(d.created_at).toLocaleString()}
                      </span>
                    </p>
                    <p className="mt-1 text-ink-600">{d.reason}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="space-y-4">
          {balance && canDo(actor.roles, "admin.finance.execute") && (
            <WalletPanel
              driverId={driver.id}
              owedMinor={balance.owedToPlatformMinor.toString()}
              creditLimitMinor={balance.creditLimitMinor.toString()}
              blocked={balance.cashBlocked}
              blockedReason={balance.blockedReason}
            />
          )}
          {mayDecide && <DecisionPanel driverId={driver.id} currentStatus={driver.status} />}
          {mayPublish && <PublishPanel driverId={driver.id} published={driver.published} />}

          <Card className="p-4 text-sm">
            <h3 className="font-semibold text-ink-900">Contact</h3>
            <p className="mt-2 text-ink-600">{driver.email}</p>
            {driver.phone && <p className="text-ink-600">{driver.phone}</p>}
            <p className="mt-2 text-xs text-ink-500">
              Base: {driver.base_location ?? "not set"}
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}

interface DriverRow {
  id: string; public_name: string; handle: string; legal_first_name: string | null;
  legal_last_name: string | null; bio: string | null; status: string; published: boolean;
  submitted_at: Date | null; suspended_reason: string | null;
  email: string; phone: string | null; base_location: string | null;
}
interface DocRow { id: string; type: string; state: string; expires_on: string | null; review_reason: string | null; created_at: Date }
interface VehicleRow {
  id: string; make: string; model: string; year: number; plate: string; class: string;
  seats: number; luggage: number; status: string; published: boolean; capabilities: unknown;
}
interface LangRow { language: string; declared_level: string; verified_level: string | null }
interface DecisionRow { from_state: string; to_state: string; reason: string; created_at: Date }
