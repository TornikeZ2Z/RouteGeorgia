import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { sql } from "@db/client";
import { Alert, Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { ModerateReview } from "./moderate";

export const dynamic = "force-dynamic";

/** Personal data that must be stripped before a review is published. */
const PII = [
  { label: "phone number", re: /\+?\d[\d\s().-]{7,}/ },
  { label: "email address", re: /\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/i },
  { label: "web address", re: /\b(?:https?:\/\/|www\.)\S+/i },
  { label: "messaging handle", re: /\b(whatsapp|telegram|viber|instagram)\b/i },
];

export default async function ReviewQueue() {
  await requirePermission("admin.drivers.decide");

  const rows = await sql<Row[]>`
    SELECT r.id, r.rating_overall, r.rating_safety, r.rating_punctuality,
           r.rating_cleanliness, r.rating_communication, r.author_name, r.body,
           r.status::text AS status, r.created_at, r.source_locale,
           d.public_name AS driver_name, d.id AS driver_id, b.code
    FROM reviews r
    JOIN driver_profiles d ON d.id = r.driver_id
    JOIN bookings b ON b.id = r.booking_id
    WHERE r.status = 'SUBMITTED'
    ORDER BY r.created_at
    LIMIT 50`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Review moderation"
        description="Publish or reject for personal data, threats and spam — never for being critical."
      />

      <Alert tone="info" title="What to reject">
        Personal contact details, abuse or threats, spam, and anything unrelated to the trip. A
        one-star review that describes a genuinely bad experience gets published.
      </Alert>

      {rows.length === 0 ? (
        <EmptyState title="Nothing waiting for moderation" />
      ) : (
        <ul className="space-y-4">
          {rows.map((r) => {
            const flags = PII.filter((p) => r.body && p.re.test(r.body)).map((p) => p.label);
            return (
              <li key={r.id}>
                <Card className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-ink-900">
                        {r.rating_overall}/5 for{" "}
                        <Link href={`/admin/drivers/${r.driver_id}`} className="text-ink-900 underline">
                          {r.driver_name}
                        </Link>
                      </p>
                      <p className="text-xs text-ink-500">
                        {r.author_name ?? "anonymous"} · booking {r.code} ·{" "}
                        {new Date(r.created_at).toLocaleDateString()} · {r.source_locale}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5 text-xs">
                      {[["safety", r.rating_safety], ["punctuality", r.rating_punctuality],
                        ["clean", r.rating_cleanliness], ["comms", r.rating_communication]]
                        .filter(([, v]) => v !== null)
                        .map(([k, v]) => <Badge key={k as string}>{k as string} {v}</Badge>)}
                    </div>
                  </div>

                  {r.body && (
                    <blockquote className="mt-3 border-l-2 border-ink-200 pl-3 text-sm text-ink-700">
                      {r.body}
                    </blockquote>
                  )}

                  {flags.length > 0 && (
                    <div className="mt-3">
                      <Alert tone="warning" title="Possible personal data">
                        Detected: {flags.join(", ")}. Redact it in the published text below rather than
                        rejecting the whole review.
                      </Alert>
                    </div>
                  )}

                  <div className="mt-3 border-t border-ink-100 pt-3">
                    <ModerateReview reviewId={r.id} originalBody={r.body ?? ""} />
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

interface Row {
  id: string; rating_overall: number; rating_safety: number | null; rating_punctuality: number | null;
  rating_cleanliness: number | null; rating_communication: number | null;
  author_name: string | null; body: string | null; status: string; created_at: Date;
  source_locale: string; driver_name: string; driver_id: string; code: string;
}
