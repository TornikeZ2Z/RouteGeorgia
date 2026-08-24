import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/rbac";
import { sql } from "@db/client";
import { Alert, Badge, Card, PageHeader, Table } from "@/components/ui";
import { DecisionPanel, DocumentDecision, VehicleDecision, LanguageVerification, PublishPanel, UploadDocumentPanel } from "./panels";
import { AdminDriverProfileForm, ResetPasswordPanel, WalletPanel } from "../forms";
import { impersonateDriverAction } from "@/app/admin/actions";
import {
  adminT, driverStatusLabel, docTypeLabel, reviewStateLabel, vehicleStateLabel, proficiencyLabel,
} from "@/lib/i18n/admin";
import { driverBalance } from "@/lib/ledger";
import { getActiveContract, getSignature, missingCompanyDetails } from "@/lib/contract";
import { can as canDo } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function DriverDetail({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePermission("admin.drivers.read");
  const { id } = await params;

  const t = adminT(actor.locale);

  const [driver] = await sql<DriverRow[]>`
    SELECT d.id, d.public_name, d.handle, d.legal_first_name, d.legal_last_name, d.bio,
           d.status::text AS status, d.published, d.submitted_at, d.suspended_reason,
           d.applied_via, d.experience_years, d.referral_source, d.date_of_birth,
           d.base_location_id,
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

  const [contract, signature] = await Promise.all([getActiveContract("en"), getSignature(id)]);
  const missingCompany = missingCompanyDetails();

  const locations = await sql<{ id: string; name_en: string }[]>`
    SELECT id, name_en FROM locations ORDER BY name_en`;

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
            <Badge tone={driver.status === "APPROVED" ? "success" : "info"}>{driverStatusLabel(driver.status, actor.locale)}</Badge>
            {driver.published && <Badge tone="success">{t("drivers.live")}</Badge>}
          </>
        }
      />

      {driver.suspended_reason && (
        <Alert tone="danger" title={t("driver.suspendedTitle")}>{driver.suspended_reason}</Alert>
      )}

      {!mayDecide && (
        <Alert tone="info">{t("driver.supportReadOnly")}</Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section>
            <h2 className="mb-2 font-semibold text-ink-900">{t("driver.documentsTitle")}</h2>
            <Table head={[t("col.type"), t("col.expires"), t("col.state"), t("col.note"), ...(mayDecideDocs ? [t("col.decision")] : [])]}>
              {docs.map((d) => (
                <tr key={d.id}>
                  <td className="px-4 py-2.5">
                    {canDo(actor.roles, "admin.documents.read") ? (
                      <a href={`/api/admin/documents/${d.id}`} target="_blank" rel="noreferrer"
                         className="text-ink-900 underline">
                        {docTypeLabel(d.type, actor.locale)}
                      </a>
                    ) : docTypeLabel(d.type, actor.locale)}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums">
                    {d.expires_on ?? "—"}
                    {d.expires_on && new Date(d.expires_on) < new Date() && (
                      <span className="ml-2 text-xs text-[--color-danger]">{t("common.expired")}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone={d.state === "APPROVED" ? "success" : d.state === "PENDING" ? "info" : "warning"}>
                      {reviewStateLabel(d.state, actor.locale)}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-ink-600">{d.review_reason ?? "—"}</td>
                  {mayDecideDocs && (
                    <td className="px-4 py-2.5">
                      <DocumentDecision documentId={d.id} driverId={driver.id} locale={actor.locale} />
                    </td>
                  )}
                </tr>
              ))}
            </Table>
            {mayDecideDocs && (
              <div className="mt-4">
                <UploadDocumentPanel
                  driverId={driver.id}
                  locale={actor.locale}
                  vehicles={vehicleRows.map((v) => ({ id: v.id, label: `${v.make} ${v.model} (${v.plate ?? v.year})` }))}
                />
              </div>
            )}
            <p className="mt-2 text-xs text-ink-500">{t("driver.kycNote")}</p>
          </section>

          <section>
            <h2 className="mb-2 font-semibold text-ink-900">{t("driver.vehiclesTitle")}</h2>
            <Table head={[t("col.vehicle"), t("col.plate"), t("col.class"), t("col.capacity"), "4x4", t("col.state"), ...(mayDecide ? [t("col.decision")] : [])]}>
              {vehicleRows.map((v) => (
                <tr key={v.id}>
                  <td className="px-4 py-2.5">{v.make} {v.model} · {v.year}</td>
                  <td className="px-4 py-2.5 tabular-nums">{v.plate}</td>
                  <td className="px-4 py-2.5">{v.class.replaceAll("_", " ").toLowerCase()}</td>
                  <td className="px-4 py-2.5">{v.seats}/{v.luggage}</td>
                  <td className="px-4 py-2.5">
                    {(v.capabilities as Record<string, boolean>)?.four_wheel_drive ? t("common.yes") : t("common.no")}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone={v.published ? "success" : "neutral"}>
                      {v.published ? vehicleStateLabel("PUBLISHED", actor.locale) : vehicleStateLabel(v.status, actor.locale)}
                    </Badge>
                  </td>
                  {mayDecide && (
                    <td className="px-4 py-2.5">
                      <VehicleDecision vehicleId={v.id} driverId={driver.id} locale={actor.locale} />
                    </td>
                  )}
                </tr>
              ))}
            </Table>
          </section>

          <section>
            <h2 className="mb-2 font-semibold text-ink-900">{t("driver.languagesTitle")}</h2>
            <Table head={[t("col.language"), t("col.declared"), t("col.verified"), ...(mayDecide ? [t("col.interview")] : [])]}>
              {languages.map((l) => (
                <tr key={l.language}>
                  <td className="px-4 py-2.5">{l.language}</td>
                  <td className="px-4 py-2.5">{proficiencyLabel(l.declared_level, actor.locale)}</td>
                  <td className="px-4 py-2.5">
                    {l.verified_level
                      ? <Badge tone="success">{proficiencyLabel(l.verified_level, actor.locale)}</Badge>
                      : <Badge tone="warning">{t("common.unverified")}</Badge>}
                  </td>
                  {mayDecide && (
                    <td className="px-4 py-2.5">
                      <LanguageVerification driverId={driver.id} language={l.language} locale={actor.locale} />
                    </td>
                  )}
                </tr>
              ))}
            </Table>
          </section>

          <section>
            <h2 className="mb-2 font-semibold text-ink-900">{t("driver.historyTitle")}</h2>
            {decisions.length === 0 ? (
              <p className="text-sm text-ink-500">{t("driver.historyEmpty")}</p>
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
          {/* Publication is blocked without a signature, by this console and by
              a trigger on driver_profiles. Say where the file stands before a
              reviewer tries and gets refused. */}
          <Card className="p-4 text-sm">
            <h3 className="font-semibold text-ink-900">{t("driver.agreementTitle")}</h3>
            {signature ? (
              <dl className="mt-2 space-y-1.5 text-ink-600">
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-500">{t("agr.status")}</dt>
                  <dd><Badge tone="success">{t("agr.signed")}</Badge></dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-500">{t("agr.version")}</dt>
                  <dd className="text-right">{signature.contractVersion}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-500">{t("agr.signedAt")}</dt>
                  <dd className="text-right tabular-nums">
                    {new Date(signature.signedAt).toLocaleString()}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-500">{t("agr.nameTyped")}</dt>
                  <dd className="text-right">{signature.signedName}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-500">{t("agr.language")}</dt>
                  <dd className="text-right uppercase">{signature.locale}</dd>
                </div>
                <div className="mt-1 border-t border-ink-100 pt-2">
                  <dt className="text-ink-500">{t("agr.fingerprint")}</dt>
                  <dd className="mt-1 break-all font-mono text-[11px] text-ink-600">
                    {signature.bodyHash}
                  </dd>
                </div>
              </dl>
            ) : missingCompany.length > 0 ? (
              <p className="mt-2 leading-relaxed text-ink-600">
                {t("agr.noCompany", { fields: missingCompany.join(", ") })}
              </p>
            ) : !contract ? (
              <p className="mt-2 leading-relaxed text-ink-600">{t("agr.noVersion")}</p>
            ) : (
              <p className="mt-2 leading-relaxed text-ink-600">
                <Badge tone="warning">{t("agr.notSigned")}</Badge>{" "}
                <span className="mt-2 block">{t("agr.waiting", { version: contract.version })}</span>
              </p>
            )}
          </Card>

          {mayDecide && (
            <Card className="p-5">
              <h2 className="font-semibold text-ink-900">{t("impersonate.title")}</h2>
              <p className="mt-1 text-sm leading-relaxed text-ink-600">{t("impersonate.body")}</p>
              <form action={impersonateDriverAction} className="mt-3">
                <input type="hidden" name="driverId" value={driver.id} />
                <button className="min-h-11 rounded-xl bg-gold-400 px-4 text-sm font-bold text-pine-900 hover:bg-gold-300">
                  {t("impersonate.cta")}
                </button>
              </form>
            </Card>
          )}

          {mayDecide && (
            <AdminDriverProfileForm
              driver={driver}
              locations={locations}
              labels={{
                title: t("editProfile.title"), body: t("editProfile.body"),
                publicName: t("editProfile.publicName"), firstName: t("editProfile.firstName"),
                lastName: t("editProfile.lastName"), phone: t("editProfile.phone"),
                baseLocation: t("editProfile.baseLocation"), bio: t("editProfile.bio"),
                reason: t("editProfile.reason"), save: t("editProfile.save"),
                notSet: t("driver.notSet"),
              }}
            />
          )}

          {mayDecide && (
            <ResetPasswordPanel
              driverId={driver.id}
              labels={{ title: t("resetPw.title"), body: t("resetPw.body"), cta: t("resetPw.cta") }}
            />
          )}

          {mayDecide && <DecisionPanel driverId={driver.id} currentStatus={driver.status} locale={actor.locale} />}
          {mayPublish && <PublishPanel driverId={driver.id} published={driver.published} locale={actor.locale} />}

          <Card className="p-4 text-sm">
            <h3 className="font-semibold text-ink-900">{t("driver.contactTitle")}</h3>
            <p className="mt-2 text-ink-600">{driver.email}</p>
            {driver.phone && <p className="text-ink-600">{driver.phone}</p>}
            <p className="mt-2 text-xs text-ink-500">
              {t("driver.base")}: {driver.base_location ?? t("driver.notSet")}
            </p>
          </Card>

          {/* Where the file came from and what the applicant declared about
              themselves. A self-service application is not less trustworthy
              than one typed in the office, but a reviewer should know which
              one they are reading. */}
          <Card className="p-4 text-sm">
            <h3 className="font-semibold text-ink-900">{t("driver.applicationTitle")}</h3>
            <dl className="mt-2 space-y-1.5 text-ink-600">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-500">{t("driver.source")}</dt>
                <dd className="text-right">
                  {driver.applied_via === "public_form" ? t("driver.srcPublic") :
                   driver.applied_via === "import" ? t("driver.srcImport") : t("driver.srcStaff")}
                </dd>
              </div>
              {driver.submitted_at && (
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-500">{t("driver.submittedAt")}</dt>
                  <dd className="text-right tabular-nums">
                    {new Date(driver.submitted_at).toLocaleDateString()}
                  </dd>
                </div>
              )}
              {driver.date_of_birth && (
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-500">{t("driver.born")}</dt>
                  <dd className="text-right tabular-nums">{driver.date_of_birth}</dd>
                </div>
              )}
              {driver.experience_years !== null && (
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-500">{t("driver.declaredExp")}</dt>
                  <dd className="text-right tabular-nums">{driver.experience_years} {t("driver.years")}</dd>
                </div>
              )}
              {driver.referral_source && (
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-500">{t("driver.heard")}</dt>
                  <dd className="text-right">{driver.referral_source}</dd>
                </div>
              )}
            </dl>
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
  applied_via: string; experience_years: number | null; referral_source: string | null;
  date_of_birth: string | null;
  email: string; phone: string | null; base_location: string | null;
  base_location_id: string | null;
}
interface DocRow { id: string; type: string; state: string; expires_on: string | null; review_reason: string | null; created_at: Date }
interface VehicleRow {
  id: string; make: string; model: string; year: number; plate: string; class: string;
  seats: number; luggage: number; status: string; published: boolean; capabilities: unknown;
}
interface LangRow { language: string; declared_level: string; verified_level: string | null }
interface DecisionRow { from_state: string; to_state: string; reason: string; created_at: Date }
