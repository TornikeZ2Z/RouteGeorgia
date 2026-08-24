"use client";

import { useState } from "react";
import Link from "next/link";
import { SearchForm } from "@/components/search-form";
import { getTranslator, isLocale, type Locale } from "@/lib/i18n";

interface LocationOption { slug: string; name_en: string; type: string }

/**
 * The booking widget's mode switcher: Transfer, Tours, Build my route.
 *
 * Transfer carries a one-way / round-trip toggle inside the panel, with a
 * quiet link to hourly hire (no online pricing yet, so it routes to an
 * inquiry rather than pretending). Tours points at the curated catalogue;
 * Build my route hands over to the three-question planner.
 */
export function SearchTabs({ locale, locations }: { locale: string; locations: LocationOption[] }) {
  const t = getTranslator(isLocale(locale) ? (locale as Locale) : "en");
  const [tab, setTab] = useState<"transfer" | "tours" | "plan">("transfer");
  const [roundTrip, setRoundTrip] = useState(false);

  const tabs = [
    { id: "transfer" as const, label: t("home.tabTransfer"), icon: "M3 15h18M5 15V9a2 2 0 0 1 2-2h7l4 4h1a2 2 0 0 1 2 2v2M7.5 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm9 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" },
    { id: "tours" as const, label: t("home.tabTours"), icon: "M9 20l-5-2V5l5 2m0 13 6-2m-6 2V7m6 11 5 2V7l-5-2m0 13V5M9 7l6-2" },
    { id: "plan" as const, label: t("nav.plan"), icon: "M9 6h11M9 12h11M9 18h11M4.5 7.5 6 6v4.5M4 13.5h3L4 17h3" },
  ];

  return (
    <div>
      <div role="tablist" aria-label={t("home.planTitle")} className="flex flex-wrap gap-1 border-b border-ink-100 pb-4">
        {tabs.map(({ id, label, icon }) => (
          <button
            key={id} role="tab" type="button"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm transition-colors ${
              tab === id ? "bg-brand-600 font-semibold text-white" : "text-ink-500 hover:text-ink-900"
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
        {tab === "transfer" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div role="radiogroup" aria-label={t("home.tabTransfer")}
                   className="inline-flex rounded-full border border-ink-200 p-0.5 text-xs font-semibold">
                {([false, true] as const).map((rt) => (
                  <button
                    key={String(rt)} type="button" role="radio" aria-checked={roundTrip === rt}
                    onClick={() => setRoundTrip(rt)}
                    className={`rounded-full px-3.5 py-1.5 transition-colors ${
                      roundTrip === rt ? "bg-brand-600 text-white" : "text-ink-500 hover:text-ink-900"
                    }`}
                  >
                    {rt ? t("home.tabRoundTrip") : t("home.tabOneWay")}
                  </button>
                ))}
              </div>
              <Link href={`/${locale}/hourly`}
                    className="text-xs font-medium text-ink-500 underline-offset-2 hover:text-ink-900 hover:underline">
                {t("home.tabHourly")} →
              </Link>
            </div>
            {roundTrip
              ? <SearchForm key="rt" locale={locale} locations={locations} roundTrip />
              : <SearchForm key="ow" locale={locale} locations={locations} />}
          </div>
        )}
        {tab === "tours" && (
          <TeaserPanel body={t("home.toursTabBody")} cta={t("home.toursTabCta")} href={`/${locale}/tours`} />
        )}
        {tab === "plan" && (
          <TeaserPanel body={t("home.planTabBody")} cta={t("nav.plan")} href={`/${locale}/plan`} />
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
        className="inline-flex min-h-11 shrink-0 items-center rounded-lg bg-brand-600 px-5 py-2.5 text-sm text-white shadow-[0_0_2px_0_rgba(0,0,0,.16)] transition-colors hover:bg-brand-700"
      >
        {cta}
      </Link>
    </div>
  );
}
