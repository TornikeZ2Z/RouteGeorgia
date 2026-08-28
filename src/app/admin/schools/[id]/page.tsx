import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/rbac";
import { Alert, Badge, Card, PageHeader, Table } from "@/components/ui";
import { toMajorString } from "@/lib/money";
import { missingCompanyDetails, parseContract } from "@/lib/contract";
import {
  getSchool, getSchoolSignature, listSchoolOrders, schoolAgreementFor,
} from "@/lib/schools";
import { RecordSignatureForm, NewOrderForm, OrderStatusForm } from "../forms";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

const ORDER_TONE = {
  DRAFT: "neutral", CONFIRMED: "success", COMPLETED: "neutral", CANCELLED: "warning",
} as const;

export default async function SchoolPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requirePermission("admin.schools.read");
  const mayWrite = can(actor.roles, "admin.schools.write");
  const mayRecord = can(actor.roles, "admin.schools.agreement");

  const school = await getSchool(id);
  if (!school) notFound();

  const [agreement, signature, orders] = await Promise.all([
    schoolAgreementFor(school, "ka"),
    getSchoolSignature(school.id),
    listSchoolOrders(school.id),
  ]);

  const missingCompany = missingCompanyDetails();
  // A blank anywhere in the rendered text means the printed instrument would
  // carry one too, which is the thing the signing flow must not allow.
  const hasBlanks = agreement?.body.includes("____________") ?? false;

  const dateFmt = (d: Date) =>
    new Date(d).toLocaleDateString("en-GB", { dateStyle: "medium" });

  return (
    <div className="space-y-6">
      <PageHeader
        title={school.name}
        description={`Identification code ${school.idNumber} · ${school.director}`}
        actions={
          signature
            ? <Badge tone="success">Agreement signed</Badge>
            : <Badge tone="warning">Not signed</Badge>
        }
      />

      <Card className="p-5">
        <dl className="grid gap-4 text-sm sm:grid-cols-4">
          <div><dt className="text-ink-500">Status</dt><dd className="mt-0.5 font-medium">{school.status.toLowerCase()}</dd></div>
          <div><dt className="text-ink-500">Address</dt><dd className="mt-0.5">{school.address ?? "—"}</dd></div>
          <div><dt className="text-ink-500">Telephone</dt><dd className="mt-0.5">{school.phone ?? "—"}</dd></div>
          <div><dt className="text-ink-500">Email</dt><dd className="mt-0.5">{school.email ?? "—"}</dd></div>
        </dl>
        {school.notes && (
          <p className="mt-4 border-t border-ink-100 pt-3 text-sm text-ink-600">{school.notes}</p>
        )}
      </Card>

      {missingCompany.length > 0 && (
        <Alert tone="warning" title="The company's own details are incomplete">
          {missingCompany.join(", ")} not set, so the agreement would print with blanks where the
          provider should be named. Set them in the service configuration before printing anything
          for signature.
        </Alert>
      )}

      {signature && (
        <Alert tone="success" title="Agreement on file">
          Signed by {signature.signedName}
          {signature.signedRole ? ` (${signature.signedRole})` : ""} on {dateFmt(signature.signedAt)},
          version {signature.contractVersion}, {signature.method.replace("_", " ").toLowerCase()}.
          Fingerprint {signature.bodyHash.slice(0, 16)}.
        </Alert>
      )}

      {!agreement && (
        <Alert tone="warning" title="No school agreement is published">
          Nothing can be printed or signed until a version is published.
        </Alert>
      )}

      {agreement && (
        <Card className="p-5 sm:p-8">
          <div className="mb-4 flex items-baseline justify-between gap-4">
            <h2 className="font-display text-xl text-ink-900">{agreement.title}</h2>
            <span className="text-xs text-ink-500">Version {agreement.version}</span>
          </div>

          {hasBlanks && (
            <Alert tone="warning" title="This copy still has blanks">
              Fill in the missing details before printing. A signed agreement with a blank in it is
              a defect, and recording one is refused.
            </Alert>
          )}

          <article className="prose-contract mt-4 max-w-none">
            {(() => {
              const { intro, sections } = parseContract(agreement.body);
              return (
                <>
                  {intro.map((p, i) => (
                    <p key={`intro-${i}`} className="text-base leading-relaxed text-ink-700">{p}</p>
                  ))}
                  {sections.map((section) => (
                    <section key={section.heading} className="mt-8">
                      <h3 className="font-display text-lg text-ink-900">{section.heading}</h3>
                      <div className="rule-fade mt-2" />
                      <div className="mt-3 space-y-3">
                        {section.paragraphs.map((p, i) => (
                          <p key={i} className="leading-relaxed text-ink-700">{p}</p>
                        ))}
                      </div>
                    </section>
                  ))}
                </>
              );
            })()}
          </article>
        </Card>
      )}

      {mayRecord && agreement && !signature && !hasBlanks && (
        <RecordSignatureForm schoolId={school.id} />
      )}

      <Card className="p-0">
        <div className="border-b border-ink-100 px-4 py-3">
          <h2 className="font-display text-lg text-ink-900">Order sheets</h2>
        </div>
        <Table head={["Reference", "Date", "Route", "Group", "Package", "Price", "Status"]}>
          {orders.map((o) => (
            <tr key={o.id}>
              <td className="px-4 py-3 font-medium tabular-nums">{o.reference}</td>
              <td className="px-4 py-3">{dateFmt(o.tripDate)}</td>
              <td className="px-4 py-3">{o.pickupPlace} → {o.destination}</td>
              <td className="px-4 py-3 tabular-nums">{o.students} + {o.chaperones}</td>
              <td className="px-4 py-3">
                {o.package}
                {o.safetyCoordinator && <span className="ml-1 text-xs text-ink-500">+SC</span>}
                {o.parentUpdates && <span className="ml-1 text-xs text-ink-500">+PU</span>}
              </td>
              <td className="px-4 py-3 tabular-nums">
                {toMajorString(o.totalPriceMinor)}
                {o.prepaidMinor > 0n && (
                  <span className="text-xs text-ink-500"> ({toMajorString(o.prepaidMinor)} paid)</span>
                )}
              </td>
              <td className="px-4 py-3">
                <Badge tone={ORDER_TONE[o.status]}>{o.status.toLowerCase()}</Badge>
                {mayWrite && (
                  <div className="mt-2"><OrderStatusForm orderId={o.id} status={o.status} /></div>
                )}
              </td>
            </tr>
          ))}
          {orders.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-8 text-center text-sm text-ink-500">
                No trips booked for this school yet.
              </td>
            </tr>
          )}
        </Table>
      </Card>

      {mayWrite && <NewOrderForm schoolId={school.id} />}

      <p className="text-sm">
        <Link href="/admin/schools" className="text-pine-800 hover:underline">← All schools</Link>
      </p>
    </div>
  );
}
