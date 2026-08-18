import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isLocale, LOCALES, getTranslator, type Locale } from "@/lib/i18n";
import { listRoutes } from "@/lib/routes-content";
import { config } from "@/lib/config";
import { Badge } from "@/components/ui";
import { PlaceImage } from "@/components/place-image";
import { formatDuration, formatDistance } from "@/lib/format";

export const revalidate = 3600;

interface Props { params: Promise<{ locale: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const url = `${config.appUrl}/${locale}/transfers`;
  return {
    title: "Private transfers across Georgia",
    description: "Every route we serve, with distance, driving time and a fixed price for the whole vehicle.",
    alternates: {
      canonical: url,
      languages: Object.fromEntries(LOCALES.map((l) => [l, `${config.appUrl}/${l}/transfers`])),
    },
  };
}

export default async function TransfersIndex({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getTranslator(locale as Locale);
  const routes = await listRoutes(locale);

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow text-wine-600">{t("transfers.eyebrow")}</p>
        <h1 className="font-display mt-3 text-4xl text-ink-900 sm:text-5xl">
          {t("transfers.title")}
        </h1>
        <p className="mt-2 max-w-2xl text-ink-600">
          {t("transfers.intro")}
        </p>
      </header>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {routes.map((r) => (
          <li key={r.slug}>
            <Link
              href={`/${locale}/transfers/${r.slug}`}
              className="block h-full overflow-hidden rounded-xl border border-ink-200 bg-white hover:border-wine-300"
            >
              <PlaceImage
                imageKey={r.imageKey}
                alt={r.imageAlt ?? `${r.originName} to ${r.destinationName}`}
                seedText={r.slug}
                className="h-28 w-full"
              />
              <div className="p-4">
              <p className="font-medium text-ink-900">
                {r.originName} <span className="text-ink-400" aria-hidden>→</span> {r.destinationName}
              </p>
              <p className="mt-1 text-sm text-ink-500">
                {formatDistance(r.distanceKm)} · {formatDuration(r.driveMinutes)}
              </p>
              {r.requires4x4 && <span className="mt-2 inline-block"><Badge tone="warning">{t("tours.fourByFour")}</Badge></span>}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
