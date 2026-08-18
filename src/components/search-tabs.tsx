"use client";

import { useState } from "react";
import Link from "next/link";
import { SearchForm } from "@/components/search-form";
import { getTranslator, isLocale, type Locale } from "@/lib/i18n";

interface LocationOption { slug: string; name_en: string; type: string }

/**
 * The booking widget's mode switcher: one way, round trip, hourly, tours.
 *
 * One way and round trip are fully priced online. Hourly has no online
 * pricing yet, so that tab is honest about it and routes to an inquiry
 * instead of pretending. Tours points at the curated catalogue.
 */
export function SearchTabs({ locale, locations }: { locale: string; locations: LocationOption[] }) {
  const t = getTranslator(isLocale(locale) ? (locale as Locale) : "en");
  const [tab, setTab] = useState<"oneway" | "roundtrip" | "hourly" | "tours">("oneway");

  const tabs = [
    { id: "oneway" as const, label: t("home.tabOneWay"), icon: "M4 12h13m0 0-4-4m4 4-4 4" },
    { id: "roundtrip" as const, label: t("home.tabRoundTrip"), icon: "M4 8h13m0 0-3.5-3.5M17 8l-3.5 3.5M20 16H7m0 0 3.5-3.5M7 16l3.5 3.5" },
    { id: "hourly" as const, label: t("home.tabHourly"), icon: "M12 7v5l3.5 2M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18Z" },
    { id: "tours" as const, label: t("home.tabTours"), icon: "M9 20l-5-2V5l5 2m0 13 6-2m-6 2V7m6 11 5 2V7l-5-2m0 13V5M9 7l6-2" },
  ];

  return (
    <div>
      <div role="tablist" aria-label={t("home.planTitle")} className="flex flex-wrap gap-1 border-b border-ink-100 pb-4">
        {tabs.map(({ id, label, icon }) => (
          <button
            key={id} role="tab" type="button"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
              tab === id ? "bg-brand-50 text-brand-700" : "text-ink-600 hover:bg-ink-50 hover:text-ink-900"
            }`}
          >
            <svg viewBox="0 0 24 24" className="size-4.5" fill="none" stroke="currentColor"
                 strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d={icon} />
            </svg>
            {label}
          </button>
        ))}
      </div>

      <div className="pt-5">
        {tab === "oneway" && <SearchForm locale={locale} locations={locations} />}
        {tab === "roundtrip" && <SearchForm locale={locale} locations={locations} roundTrip />}
        {tab === "hourly" && (
          <TeaserPanel body={t("home.hourlyTabBody")} cta={t("home.hourlyTabCta")} href={`/${locale}/hourly`} />
        )}
        {tab === "tours" && (
          <TeaserPanel body={t("home.toursTabBody")} cta={t("home.toursTabCta")} href={`/${locale}/tours`} />
        )}
      </div>
    </div>
  );
}

function TeaserPanel({ body, cta, href }: { body: string; cta: string; href: string }) {
  return (
    <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="max-w-xl text-sm leading-relaxed text-ink-600">{body}</p>
      <Link
        href={href}
        className="inline-flex min-h-11 shrink-0 items-center rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
      >
        {cta}
      </Link>
    </div>
  );
}
