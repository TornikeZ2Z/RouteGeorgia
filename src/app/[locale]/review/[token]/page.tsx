import { notFound } from "next/navigation";
import { sql } from "@db/client";
import { isLocale } from "@/lib/i18n";
import { hash } from "@/lib/booking";
import { Card, EmptyState } from "@/components/ui";
import { ReviewForm } from "./form";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false }, title: "Rate your trip" };

interface Props { params: Promise<{ locale: string; token: string }> }

export default async function ReviewPage({ params }: Props) {
  const { locale, token } = await params;
  if (!isLocale(locale)) notFound();

  // A review can only exist for a completed booking, and only once.
  const [row] = await sql<{
    booking_id: string; consumed_at: Date | null; expires_at: Date;
    status: string; driver_name: string; code: string; service_start_at: Date;
    already: number;
  }[]>`
    SELECT t.booking_id, t.consumed_at, t.expires_at, b.status::text AS status,
           d.public_name AS driver_name, b.code, b.service_start_at,
           (SELECT count(*) FROM reviews r WHERE r.booking_id = b.id)::int AS already
    FROM review_tokens t
    JOIN bookings b ON b.id = t.booking_id
    JOIN driver_profiles d ON d.id = b.driver_id
    WHERE t.token_hash = ${hash(token)}`;

  if (!row) return <EmptyState title="This review link is not valid">It may have already been used.</EmptyState>;
  if (new Date(row.expires_at) < new Date()) {
    return <EmptyState title="This review link has expired">Reviews can be left for 30 days after a trip.</EmptyState>;
  }
  if (row.consumed_at || row.already > 0) {
    return <EmptyState title="Thank you — you have already reviewed this trip" />;
  }
  if (row.status !== "COMPLETED" && row.status !== "CLOSED") {
    return <EmptyState title="This trip is not finished yet">You can review it once the trip is complete.</EmptyState>;
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
        How was your trip with {row.driver_name}?
      </h1>
      <p className="mt-1 text-sm text-ink-600">
        Booking {row.code} · {new Date(row.service_start_at).toLocaleDateString(locale, { dateStyle: "long" })}
      </p>

      <Card className="mt-6 p-4 sm:p-6">
        <ReviewForm token={token} driverName={row.driver_name} />
      </Card>

      <p className="mt-4 text-xs text-ink-500">
        Reviews are checked for personal data and abuse before publication — not for whether they are
        positive. A critical review will be published.
      </p>
    </div>
  );
}
