"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { getTranslator, isLocale, type Locale } from "@/lib/i18n";
import { buildPlan, type DaysBucket, type Interest } from "@/lib/plan";

interface TourInfo { slug: string; title: string; durationDays: number }

const DAYS: DaysBucket[] = ["1", "3", "5", "7"];
const INTERESTS: Interest[] = ["nature", "culture", "wine", "adventure", "rest"];
const INTEREST_KEY = { nature: "plan.int1", culture: "plan.int2", wine: "plan.int3", adventure: "plan.int4", rest: "plan.int5" } as const;
const PARTY_KEYS = ["plan.party1", "plan.party2", "plan.party3", "plan.party4"] as const;
const DAY_LABEL_KEY = { "1": "home.day1t", "3": "home.day2t", "5": "home.day3t", "7": "home.day4t" } as const;

/**
 * The three-question wizard. State lives in the URL (?d=&i=&p=), so a plan
 * is shareable and survives reloads without any account or database row.
 */
export function PlanWizard({
  locale, tours, placeNames, initial,
}: {
  locale: string;
  tours: TourInfo[];
  placeNames: Record<string, string>;
  initial?: { d?: string; i?: string; p?: string };
}) {
  const t = getTranslator(isLocale(locale) ? (locale as Locale) : "en");
  const [days, setDays] = useState<DaysBucket>(DAYS.includes(initial?.d as DaysBucket) ? (initial!.d as DaysBucket) : "3");
  const [interests, setInterests] = useState<Interest[]>(
    (initial?.i?.split(",").filter((x): x is Interest => INTERESTS.includes(x as Interest)) ?? ["nature"]),
  );
  const [party, setParty] = useState(Number(initial?.p ?? 0) || 0);
  const [built, setBuilt] = useState(Boolean(initial?.d));
  const [copied, setCopied] = useState(false);

  const plan = useMemo(() => buildPlan(days, interests.length ? interests : ["nature"]), [days, interests]);
  const tourBySlug = useMemo(() => new Map(tours.map((x) => [x.slug, x])), [tours]);

  const shareUrl = () =>
    `${location.origin}/${locale}/plan?d=${days}&i=${interests.join(",")}&p=${party}`;

  const pill = (active: boolean) =>
    `rounded-lg border px-4 py-2.5 text-sm transition-colors ${
      active ? "border-ink-900 bg-ink-900 text-white dark:text-pine-900" : "border-ink-300 text-ink-900 hover:border-ink-500"
    }`;

  const when = () => {
    const d = new Date(Date.now() + 48 * 3600_000);
    d.setMinutes(0, 0, 0);
    return d.toISOString().slice(0, 16);
  };

  return (
    <div className="space-y-10">
      <section>
        <h2 className="text-base font-bold tracking-[-0.02em] text-ink-900">{t("plan.qDays")}</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {DAYS.map((d) => (
            <button key={d} type="button" onClick={() => setDays(d)} className={pill(days === d)}>
              {t(DAY_LABEL_KEY[d])}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-base font-bold tracking-[-0.02em] text-ink-900">{t("plan.qInterests")}</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {INTERESTS.map((i) => (
            <button
              key={i} type="button"
              onClick={() => setInterests((cur) => cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i])}
              className={pill(interests.includes(i))}
              aria-pressed={interests.includes(i)}
            >
              {t(INTEREST_KEY[i])}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-base font-bold tracking-[-0.02em] text-ink-900">{t("plan.qParty")}</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {PARTY_KEYS.map((key, i) => (
            <button key={key} type="button" onClick={() => setParty(i)} className={pill(party === i)}>
              {t(key)}
            </button>
          ))}
        </div>
      </section>

      {!built && (
        <button
          type="button"
          onClick={() => setBuilt(true)}
          className="inline-flex min-h-12 items-center rounded-lg bg-brand-600 px-6 py-3 text-white shadow-[0_0_2px_0_rgba(0,0,0,.16)] transition-colors hover:bg-brand-700"
        >
          {t("plan.submit")}
        </button>
      )}

      {built && (
        <section className="rounded-lg border border-ink-300 bg-white p-6 sm:p-8">
          <h2 className="font-display text-3xl text-ink-900">{t("plan.resultsTitle")}</h2>
          <p className="mt-2 text-ink-500">{t("plan.resultsLead")}</p>

          <ol className="mt-6 space-y-4">
            {plan.days.map((day, i) => {
              const tour = day.tourSlug ? tourBySlug.get(day.tourSlug) : undefined;
              return (
                <li key={i} className="flex gap-4 border-t border-ink-200 pt-4 first:border-t-0 first:pt-0">
                  <span className="w-20 shrink-0 text-sm font-bold tracking-[-0.02em] text-ink-900">
                    {t("plan.day", { n: i + 1 })}
                  </span>
                  <div>
                    {tour ? (
                      <Link href={`/${locale}/tours/${tour.slug}`} className="font-bold tracking-[-0.02em] text-ink-900 underline underline-offset-4">
                        {tour.title}
                      </Link>
                    ) : (
                      <span className="text-ink-900">
                        {day.places.map((s) => placeNames[s] ?? s).join(" → ")}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            {plan.primary.kind === "tour" ? (
              <Link
                href={`/${locale}/tours/${plan.primary.slug}`}
                className="inline-flex min-h-12 items-center rounded-lg bg-brand-600 px-6 py-3 text-white shadow-[0_0_2px_0_rgba(0,0,0,.16)] transition-colors hover:bg-brand-700"
              >
                {t("plan.bookTour")}
              </Link>
            ) : (
              <Link
                href={`/${locale}/search?from=${plan.primary.from}&to=${plan.primary.to}${plan.primary.stops.map((s) => `&stop=${s}`).join("")}&when=${when()}&passengers=2&luggage=2`}
                className="inline-flex min-h-12 items-center rounded-lg bg-brand-600 px-6 py-3 text-white shadow-[0_0_2px_0_rgba(0,0,0,.16)] transition-colors hover:bg-brand-700"
              >
                {t("plan.bookTransfer")}
              </Link>
            )}
            <Link href={`/${locale}#book`} className="rounded-lg border border-ink-300 px-5 py-3 text-sm text-ink-900 hover:border-ink-500">
              {t("plan.adjust")}
            </Link>
            <button
              type="button"
              onClick={async () => { try { await navigator.clipboard.writeText(shareUrl()); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch {} }}
              className="rounded-lg border border-ink-300 px-5 py-3 text-sm text-ink-900 hover:border-ink-500"
            >
              {copied ? t("plan.shared") : t("plan.share")}
            </button>
            <button type="button" onClick={() => setBuilt(false)} className="px-2 py-3 text-sm text-ink-500 hover:text-ink-900">
              {t("plan.startOver")}
            </button>
          </div>
          <p className="mt-4 text-xs text-ink-500">{t("plan.note")}</p>
        </section>
      )}
    </div>
  );
}
