import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/rbac";
import { Alert, Badge, Card, PageHeader } from "@/components/ui";
import { getRequest, briefFor, listImages } from "@/lib/change-requests";
import { StatusForm, Brief } from "../forms";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

const STATUS_TONE = {
  NEW: "warning", TRIAGED: "neutral", IN_PROGRESS: "neutral",
  DONE: "success", DECLINED: "neutral",
} as const;

export default async function RequestPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requirePermission("admin.requests.read");
  const mayWrite = can(actor.roles, "admin.requests.write");

  const request = await getRequest(id);
  if (!request) notFound();

  const images = await listImages(request.id);

  const when = new Date(request.createdAt).toLocaleString("en-GB", {
    dateStyle: "medium", timeStyle: "short",
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={request.title}
        description={`${request.reference} · ${request.area.replace("_", " ").toLowerCase()} · ${request.urgency.toLowerCase()} urgency`}
        actions={
          <Badge tone={STATUS_TONE[request.status]}>
            {request.status.replace("_", " ").toLowerCase()}
          </Badge>
        }
      />

      <Card className="p-5 sm:p-6">
        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-ink-500">Filed by</dt>
            <dd className="mt-0.5 font-medium text-ink-900">{request.submittedByName}</dd>
            {/*
              Stated rather than glossed over. The form has no login, so this
              name is whatever the submitter typed, and somebody deciding what
              to do with the request should know that.
            */}
            <dd className="text-xs text-ink-500">
              {request.submittedByUserId ? "Signed in" : "Self-reported, not verified"}
            </dd>
          </div>
          {request.submittedByContact && (
            <div>
              <dt className="text-ink-500">Contact</dt>
              <dd className="mt-0.5">{request.submittedByContact}</dd>
            </div>
          )}
          <div>
            <dt className="text-ink-500">Filed</dt>
            <dd className="mt-0.5">{when}</dd>
          </div>
        </dl>
      </Card>

      <Card className="p-5 sm:p-6">
        <h2 className="font-display text-lg text-ink-900">What they asked for</h2>
        <p className="mt-3 whitespace-pre-wrap leading-relaxed text-ink-700">{request.body}</p>
        {request.reason && (
          <>
            <h3 className="mt-6 font-semibold text-ink-900">Why it matters</h3>
            <p className="mt-2 whitespace-pre-wrap leading-relaxed text-ink-700">{request.reason}</p>
          </>
        )}
      </Card>

      {request.resolution && (
        <Alert
          tone={request.status === "DECLINED" ? "warning" : "success"}
          title={request.status === "DECLINED" ? "Declined" : "What changed"}
        >
          {request.resolution}
        </Alert>
      )}

      {images.length > 0 && (
        <Card className="p-5 sm:p-6">
          <h2 className="font-display text-lg text-ink-900">
            {images.length === 1 ? "Screenshot" : `Screenshots (${images.length})`}
          </h2>
          {/*
            Served through an admin-gated route rather than a storage URL:
            these routinely show real customer names and pickup addresses.
          */}
          <ul className="mt-3 grid gap-4 sm:grid-cols-2">
            {images.map((img) => (
              <li key={img.id}>
                <a
                  href={`/api/admin/request-images/${img.id}`}
                  target="_blank" rel="noreferrer"
                  className="block overflow-hidden rounded-lg border border-ink-200 hover:border-pine-800"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/admin/request-images/${img.id}`} alt=""
                    className="max-h-80 w-full bg-ink-50 object-contain"
                  />
                </a>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="p-5 sm:p-6">
        <Brief text={briefFor(request, images.length)} />
      </Card>

      {mayWrite && (
        <Card className="p-5 sm:p-6">
          <h2 className="mb-3 font-display text-lg text-ink-900">Status</h2>
          <StatusForm id={request.id} status={request.status} />
        </Card>
      )}

      <p className="text-sm">
        <Link href="/admin/requests" className="text-pine-800 hover:underline">
          ← All requests
        </Link>
      </p>
    </div>
  );
}
