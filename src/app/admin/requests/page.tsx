import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { adminT, adminLocale } from "@/lib/i18n/admin";
import { Badge, Card, PageHeader, Table, Alert } from "@/components/ui";
import { listRequests, formEnabled } from "@/lib/change-requests";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

const STATUS_TONE = {
  NEW: "warning", TRIAGED: "neutral", IN_PROGRESS: "neutral",
  DONE: "success", DECLINED: "neutral",
} as const;

const URGENCY_TONE = { HIGH: "danger", NORMAL: "neutral", LOW: "neutral" } as const;

export default async function RequestsPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requirePermission("admin.requests.read");
  const sp = await searchParams;
  const includeClosed = sp.all === "1";
  const t = adminT(adminLocale(actor.locale ?? "ka"));

  const requests = await listRequests({ includeClosed });

  const fmt = (d: Date) =>
    new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  return (
    <div className="space-y-6">
      <PageHeader title={t("page.requests")} description={t("page.requestsSub")} />

      {!formEnabled() && (
        <Alert tone="warning" title="The form is switched off">
          <code>CHANGE_REQUEST_TOKEN</code> is not set, so the submission form answers 404 and
          nobody can file anything. Set it to a long random string, then share
          <code> {config.appUrl}/r/&lt;that value&gt;</code> with the team.
        </Alert>
      )}

      <Card className="p-0">
        <Table head={["Ref", "Request", "Area", "Urgency", "From", "Filed", "Status"]}>
          {requests.map((r) => (
            <tr key={r.id}>
              <td className="px-4 py-3 font-medium tabular-nums">
                <Link href={`/admin/requests/${r.id}`} className="text-pine-800 hover:underline">
                  {r.reference}
                </Link>
              </td>
              <td className="px-4 py-3">
                <Link href={`/admin/requests/${r.id}`} className="text-ink-900 hover:underline">
                  {r.title}
                </Link>
              </td>
              <td className="px-4 py-3 text-ink-600">{r.area.replace("_", " ").toLowerCase()}</td>
              <td className="px-4 py-3">
                {r.urgency === "HIGH"
                  ? <Badge tone={URGENCY_TONE.HIGH}>high</Badge>
                  : <span className="text-ink-500">{r.urgency.toLowerCase()}</span>}
              </td>
              <td className="px-4 py-3">
                {r.submittedByName}
                {!r.submittedByUserId && (
                  <span className="ml-1 text-xs text-ink-400" title="Self-reported, not verified">·</span>
                )}
              </td>
              <td className="px-4 py-3 text-ink-600">{fmt(r.createdAt)}</td>
              <td className="px-4 py-3">
                <Badge tone={STATUS_TONE[r.status]}>
                  {r.status.replace("_", " ").toLowerCase()}
                </Badge>
              </td>
            </tr>
          ))}
          {requests.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-10 text-center text-sm text-ink-500">
                {includeClosed
                  ? "Nothing has been filed yet."
                  : "Nothing open. Everything filed has been dealt with."}
              </td>
            </tr>
          )}
        </Table>
      </Card>

      <p className="text-sm">
        <Link
          href={includeClosed ? "/admin/requests" : "/admin/requests?all=1"}
          className="text-pine-800 hover:underline"
        >
          {includeClosed ? "← Open requests only" : "Show closed requests too →"}
        </Link>
      </p>
    </div>
  );
}
