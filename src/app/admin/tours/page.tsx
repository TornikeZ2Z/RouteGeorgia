import { requirePermission } from "@/lib/auth/session";
import { sql } from "@db/client";
import { Alert, Badge, Card, PageHeader } from "@/components/ui";
import { LocaleTabs, TourVisibilityForm, TourCategoryForm, type TourTranslationValue } from "./forms";

export const dynamic = "force-dynamic";

const LOCALES = ["en", "ka", "ru"] as const;

/**
 * Tour texts, in all three languages, editable without a deploy.
 *
 * Route geometry and pricing inputs (distance, days, risk, minimum fare) are
 * deliberately NOT edited here — those numbers feed the pricing engine and
 * change what customers are charged, so they live with pricing review.
 */
export default async function ToursAdmin() {
  await requirePermission("admin.content.write");

  const [tours, translations] = await Promise.all([
    sql<{ id: string; slug: string; active: boolean; category: string; duration_days: number; distance_km: string }[]>`
      SELECT id, slug, active, category, duration_days, distance_km FROM tours ORDER BY duration_days, slug`,
    sql<{ tour_id: string; locale: string; title: string; summary: string; body: string }[]>`
      SELECT tour_id, locale, title, summary, body FROM tour_translations`,
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Tours"
        description="Titles, summaries and descriptions in every language. Photography lives under Photography; pricing inputs are changed with pricing review."
      />

      {tours.length === 0 && <Alert tone="info">No tours exist yet.</Alert>}

      {tours.map((tour) => {
        const trs: TourTranslationValue[] = LOCALES.map((locale) => {
          const existing = translations.find((t) => t.tour_id === tour.id && t.locale === locale);
          return {
            locale,
            title: existing?.title ?? "",
            summary: existing?.summary ?? "",
            body: existing?.body ?? "",
          };
        });
        return (
          <Card key={tour.id} className="p-5 sm:p-6">
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <h2 className="font-display text-xl text-ink-900">{tour.slug}</h2>
              <Badge tone={tour.active ? "success" : "neutral"}>{tour.active ? "live" : "hidden"}</Badge>
              <span className="text-xs text-ink-500">
                {tour.duration_days} day(s) · {Number(tour.distance_km).toFixed(0)} km
              </span>
            </div>
            <LocaleTabs tourId={tour.id} translations={trs} />
            <div className="mt-5 grid max-w-2xl gap-4 sm:grid-cols-2">
              <TourVisibilityForm tourId={tour.id} active={tour.active} />
              <TourCategoryForm tourId={tour.id} category={tour.category} />
            </div>
          </Card>
        );
      })}
    </div>
  );
}
