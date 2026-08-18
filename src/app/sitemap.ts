import type { MetadataRoute } from "next";
import { config } from "@/lib/config";
import { LOCALES } from "@/lib/i18n";
import { listRoutes } from "@/lib/routes-content";
import { listTours } from "@/lib/tours";
import { sql } from "@db/client";

export const revalidate = 3600;

/**
 * Only publicly meaningful, indexable URLs. Search, checkout, driver and admin
 * surfaces are excluded here and additionally noindexed at the header level.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [routes, tours, drivers] = await Promise.all([
    listRoutes("en"),
    listTours("en"),
    sql<{ handle: string; updated_at: Date }[]>`
      SELECT handle, updated_at FROM driver_profiles
      WHERE published AND status = 'APPROVED'`,
  ]);

  const alternates = (path: string) => ({
    languages: Object.fromEntries(LOCALES.map((l) => [l, `${config.appUrl}/${l}${path}`])),
  });

  const entries: MetadataRoute.Sitemap = [];

  for (const locale of LOCALES) {
    entries.push(
      { url: `${config.appUrl}/${locale}`, changeFrequency: "weekly", priority: 1, alternates: alternates("") },
      { url: `${config.appUrl}/${locale}/transfers`, changeFrequency: "weekly", priority: 0.9, alternates: alternates("/transfers") },
      { url: `${config.appUrl}/${locale}/tours`, changeFrequency: "weekly", priority: 0.9, alternates: alternates("/tours") },
      { url: `${config.appUrl}/${locale}/faq`, changeFrequency: "monthly", priority: 0.4, alternates: alternates("/faq") },
      { url: `${config.appUrl}/${locale}/about`, changeFrequency: "monthly", priority: 0.5, alternates: alternates("/about") },
      { url: `${config.appUrl}/${locale}/business`, changeFrequency: "monthly", priority: 0.5, alternates: alternates("/business") },
      { url: `${config.appUrl}/${locale}/schools`, changeFrequency: "monthly", priority: 0.5, alternates: alternates("/schools") },
      { url: `${config.appUrl}/${locale}/hourly`, changeFrequency: "monthly", priority: 0.4, alternates: alternates("/hourly") },
      { url: `${config.appUrl}/${locale}/contact`, changeFrequency: "monthly", priority: 0.5, alternates: alternates("/contact") },
      { url: `${config.appUrl}/${locale}/legal/terms`, changeFrequency: "yearly", priority: 0.3, alternates: alternates("/legal/terms") },
      { url: `${config.appUrl}/${locale}/legal/privacy`, changeFrequency: "yearly", priority: 0.3, alternates: alternates("/legal/privacy") },
      { url: `${config.appUrl}/${locale}/legal/cancellation`, changeFrequency: "yearly", priority: 0.3, alternates: alternates("/legal/cancellation") },
    );

    for (const tour of tours) {
      entries.push({
        url: `${config.appUrl}/${locale}/tours/${tour.slug}`,
        changeFrequency: "monthly",
        priority: 0.8,
        alternates: alternates(`/tours/${tour.slug}`),
      });
    }

    for (const r of routes) {
      entries.push({
        url: `${config.appUrl}/${locale}/transfers/${r.slug}`,
        changeFrequency: "weekly",
        priority: 0.8,
        alternates: alternates(`/transfers/${r.slug}`),
      });
    }

    for (const d of drivers) {
      entries.push({
        url: `${config.appUrl}/${locale}/drivers/${d.handle}`,
        lastModified: d.updated_at,
        changeFrequency: "monthly",
        priority: 0.5,
      });
    }
  }

  return entries;
}
