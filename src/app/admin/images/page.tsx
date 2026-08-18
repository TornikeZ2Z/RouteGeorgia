import { requirePermission } from "@/lib/auth/session";
import { sql } from "@db/client";
import { Alert, PageHeader } from "@/components/ui";
import { ImageRow } from "./row";

export const dynamic = "force-dynamic";

/**
 * Photography for places, routes and tours.
 *
 * Everything without a photograph shows a generated illustration, so the site
 * never looks unfinished — but a real photograph of a real place will always
 * sell a trip better than a drawing.
 */
export default async function Images() {
  await requirePermission("admin.content.write");

  const [tours, routes, locations] = await Promise.all([
    sql<{ id: string; slug: string; title: string; hero_image_key: string | null; hero_image_alt: string | null }[]>`
      SELECT t.id, t.slug, coalesce(tr.title, t.slug) AS title, t.hero_image_key, t.hero_image_alt
      FROM tours t LEFT JOIN tour_translations tr ON tr.tour_id = t.id AND tr.locale = 'en'
      WHERE t.active ORDER BY t.slug`,
    sql<{ id: string; slug: string; title: string; image_key: string | null; image_alt: string | null }[]>`
      SELECT rf.id, rf.slug, o.name_en || ' → ' || d.name_en AS title, rf.image_key, rf.image_alt
      FROM route_families rf
      JOIN locations o ON o.id = rf.origin_id
      JOIN locations d ON d.id = rf.destination_id
      WHERE rf.active ORDER BY rf.distance_km`,
    sql<{ id: string; slug: string; title: string; image_key: string | null; image_alt: string | null }[]>`
      SELECT id, slug, name_en AS title, image_key, image_alt
      FROM locations WHERE in_service_area ORDER BY name_en`,
  ]);

  const sections = [
    ["Tours", "tour" as const, tours.map((t) => ({ id: t.id, slug: t.slug, title: t.title, key: t.hero_image_key, alt: t.hero_image_alt }))],
    ["Routes", "route" as const, routes.map((r) => ({ id: r.id, slug: r.slug, title: r.title, key: r.image_key, alt: r.image_alt }))],
    ["Places", "location" as const, locations.map((l) => ({ id: l.id, slug: l.slug, title: l.title, key: l.image_key, alt: l.image_alt }))],
  ] as const;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Photography"
        description="Replace the generated illustrations with real photographs."
      />

      <Alert tone="warning" title="Only upload photographs you own or have cleared">
        Stock imagery of Georgia usually carries licence conditions, and a photograph of a viewpoint
        on a page selling a trip there is a promise about what the traveller will see. Your own
        photographs, or a driver&apos;s, are safer and more honest. JPEG, PNG or WebP up to 12 MB.
      </Alert>

      {sections.map(([label, target, items]) => (
        <section key={label}>
          <h2 className="mb-3 font-semibold text-ink-900">
            {label}
            <span className="ml-2 text-sm font-normal text-ink-500">
              {items.filter((i) => i.key).length} of {items.length} have a photograph
            </span>
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <li key={item.id}>
                <ImageRow target={target} id={item.id} slug={item.slug} title={item.title}
                          imageKey={item.key} alt={item.alt} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
