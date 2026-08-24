import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { sql } from "@db/client";
import { isLocale, getTranslator, LOCALES, type MessageKey } from "@/lib/i18n";
import { config } from "@/lib/config";
import { Alert, Card, Field, Input, Select } from "@/components/ui";
import {
  APPLICATION_LANGUAGES, APPLICATION_LEVELS,
  isApplicationError, type ApplicationError,
} from "@/lib/driver-application";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getTranslator(locale);
  return {
    title: t("drive.metaTitle"),
    description: t("drive.metaDesc"),
    alternates: {
      canonical: `${config.appUrl}/${locale}/drive`,
      languages: Object.fromEntries(LOCALES.map((l) => [l, `${config.appUrl}/${l}/drive`])),
    },
  };
}

/**
 * Native names, deliberately not translated: a Turkish-speaking driver looks
 * for "Türkçe" on the page, not for the Georgian word for Turkish.
 */
const LANGUAGE_NAME: Record<(typeof APPLICATION_LANGUAGES)[number], string> = {
  en: "English", ru: "Русский",
};

const LEVEL_KEY: Record<(typeof APPLICATION_LEVELS)[number], MessageKey> = {
  BASIC: "drive.lvlBasic", CONVERSATIONAL: "drive.lvlConversational",
  FLUENT: "drive.lvlFluent", NATIVE: "drive.lvlNative",
};

const ERROR_KEY: Record<ApplicationError, MessageKey> = {
  INVALID: "drive.errInvalid", AGE: "drive.errAge", DOB: "drive.errDob",
  EXPERIENCE: "drive.errExperience", PLATE_TAKEN: "drive.errPlateTaken",
  THROTTLED: "drive.errThrottled",
};

const AMENITIES: [string, MessageKey][] = [
  ["air_conditioning", "filters.ac"], ["wifi", "filters.wifi"],
  ["child_seat", "filters.childSeat"], ["pets_allowed", "filters.pets"],
];

const CAPABILITIES: [string, MessageKey][] = [
  ["four_wheel_drive", "filters.fourByFour"], ["winter_tyres", "filters.winterTyres"],
  ["wheelchair_access", "filters.stepFree"],
];

const STEPS: [MessageKey, MessageKey][] = [
  ["drive.step1t", "drive.step1b"],
  ["drive.step2t", "drive.step2b"],
  ["drive.step3t", "drive.step3b"],
];

/** yyyy-mm-dd, n years before today. */
function isoYearsAgo(years: number): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.toISOString().slice(0, 10);
}


export default async function DrivePage({
  params, searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const { sent, error } = await searchParams;
  const t = getTranslator(locale);

  const errors = (error ?? "").split(",").map((c) => c.trim()).filter(isApplicationError);

  const locations = await sql<{ id: string; name_en: string; name_ka: string | null; name_ru: string | null }[]>`
    SELECT id, name_en, name_ka, name_ru FROM locations
    WHERE in_service_area ORDER BY name_en`;

  const placeName = (l: (typeof locations)[number]) =>
    (locale === "ka" ? l.name_ka : locale === "ru" ? l.name_ru : l.name_en) || l.name_en;

  if (sent === "1") {
    return (
      <div className="mx-auto max-w-2xl py-6">
        <Card className="p-8 text-center">
          <p className="eyebrow">{t("drive.eyebrow")}</p>
          <h1 className="font-display mt-2 text-3xl text-ink-900">{t("drive.sentTitle")}</h1>
          <p className="mx-auto mt-4 max-w-lg text-base leading-relaxed text-ink-600">
            {t("drive.sentBody")}
          </p>
          <p className="mt-6 text-sm text-ink-500">{t("drive.sentSpam")}</p>
          <Link
            href={`/${locale}`}
            className="mt-8 inline-flex min-h-11 items-center rounded-xl border border-ink-300 px-5 text-sm font-semibold text-ink-900 hover:border-ink-500"
          >
            {t("common.home")}
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <header>
        <p className="eyebrow">{t("drive.eyebrow")}</p>
        <h1 className="font-display mt-2 text-4xl text-ink-900 sm:text-5xl">{t("drive.title")}</h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-600">{t("drive.lead")}</p>
      </header>

      <ol className="grid gap-4 sm:grid-cols-3">
        {STEPS.map(([title, body], i) => (
          <li key={title} className="rounded-xl border border-ink-200 bg-white p-5">
            <span
              aria-hidden
              className="grid size-8 place-items-center rounded-full bg-pine-800 text-sm font-bold text-white"
            >
              {i + 1}
            </span>
            <p className="mt-3 font-semibold text-ink-900">{t(title)}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{t(body)}</p>
          </li>
        ))}
      </ol>

      <Card className="p-6 sm:p-8">
        <h2 id="apply" className="font-display scroll-mt-24 text-2xl text-ink-900">
          {t("drive.formTitle")}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-600">{t("drive.formLead")}</p>

        {errors.length > 0 && (
          <div className="mt-5">
            <Alert tone="danger" title={t("drive.errorTitle")}>
              <ul className="mt-1 list-inside list-disc space-y-1">
                {errors.map((code) => <li key={code}>{t(ERROR_KEY[code])}</li>)}
              </ul>
            </Alert>
          </div>
        )}

        <form method="post" action="/api/driver-applications" className="mt-8 space-y-10">
          <input type="hidden" name="locale" value={locale} />
          <p className="hidden" aria-hidden>
            <label>
              website<input type="text" name="website" tabIndex={-1} autoComplete="off" />
            </label>
          </p>

          {/* ------------------------------------------------------ you --- */}
          <fieldset className="space-y-4">
            <legend className="font-display text-lg text-ink-900">{t("drive.sec1")}</legend>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("drive.firstName")} htmlFor="firstName" required>
                <Input id="firstName" name="legalFirstName" required minLength={2} maxLength={80}
                       autoComplete="given-name" />
              </Field>
              <Field label={t("drive.lastName")} htmlFor="lastName" required>
                <Input id="lastName" name="legalLastName" required minLength={2} maxLength={80}
                       autoComplete="family-name" />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("drive.dob")} htmlFor="dateOfBirth" hint={t("drive.dobHint")} required>
                <Input id="dateOfBirth" name="dateOfBirth" type="date" required
                       max={isoYearsAgo(21)} min={isoYearsAgo(90)} autoComplete="bday" />
              </Field>
              <Field label={t("drive.experience")} htmlFor="experienceYears" hint={t("drive.experienceHint")} required>
                <Input id="experienceYears" name="experienceYears" type="number" inputMode="numeric"
                       min={0} max={70} required />
              </Field>
              <Field label={t("inquiry.email")} htmlFor="email" hint={t("drive.emailHint")} required>
                <Input id="email" name="email" type="email" required maxLength={200} autoComplete="email" />
              </Field>
              <Field label={t("inquiry.phone")} htmlFor="phone" required>
                <Input id="phone" name="phone" type="tel" required minLength={6} maxLength={40}
                       placeholder="+995 5xx xx xx xx" autoComplete="tel" />
              </Field>
            </div>

            <Field label={t("drive.base")} htmlFor="baseLocationId" hint={t("drive.baseHint")}>
              <Select id="baseLocationId" name="baseLocationId" defaultValue="">
                <option value="">{t("search.choosePlace")}</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{placeName(l)}</option>)}
              </Select>
            </Field>

            <Field label={t("drive.referral")} htmlFor="referralSource" hint={t("drive.referralHint")}>
              <Input id="referralSource" name="referralSource" maxLength={120} />
            </Field>
          </fieldset>

          {/* ------------------------------------------------ languages --- */}
          <fieldset className="space-y-3 border-t border-ink-100 pt-8">
            <legend className="font-display text-lg text-ink-900">{t("drive.sec2")}</legend>
            <p className="text-sm leading-relaxed text-ink-600">{t("drive.langHint")}</p>

            {/* Each row stacks the level under the language rather than sitting
                beside it: Select carries w-full from the shared field styles, so
                in a flex row it pushed past the card edge — and the level names
                are long in Georgian and Russian. */}
            <ul className="grid gap-2 sm:grid-cols-2">
              {APPLICATION_LANGUAGES.map((code) => (
                <li key={code} className="rounded-xl border border-ink-200 p-3">
                  <label className="flex min-h-11 items-center gap-2.5 text-sm font-medium text-ink-900">
                    <input type="checkbox" name="language" value={code}
                           className="size-5 rounded border-ink-300" />
                    {LANGUAGE_NAME[code]}
                  </label>
                  <label className="sr-only" htmlFor={`level_${code}`}>
                    {t("drive.levelFor", { language: LANGUAGE_NAME[code] })}
                  </label>
                  <Select id={`level_${code}`} name={`level_${code}`} defaultValue="CONVERSATIONAL"
                          className="mt-1 text-sm">
                    {APPLICATION_LEVELS.map((level) => (
                      <option key={level} value={level}>{t(LEVEL_KEY[level])}</option>
                    ))}
                  </Select>
                </li>
              ))}
            </ul>
            <p className="text-xs text-ink-500">{t("drive.langVerifyNote")}</p>
          </fieldset>

          {/* -------------------------------------------------- vehicle --- */}
          <fieldset className="space-y-4 border-t border-ink-100 pt-8">
            <legend className="font-display text-lg text-ink-900">{t("drive.sec3")}</legend>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("drive.make")} htmlFor="make" required>
                <Input id="make" name="make" required maxLength={40} placeholder="Toyota" />
              </Field>
              <Field label={t("drive.model")} htmlFor="model" required>
                <Input id="model" name="model" required maxLength={40} placeholder="Land Cruiser Prado" />
              </Field>
              <Field label={t("drive.year")} htmlFor="year" required>
                <Input id="year" name="year" type="number" inputMode="numeric"
                       min={1990} max={new Date().getFullYear() + 1} required />
              </Field>
              <Field label={t("drive.color")} htmlFor="color">
                <Input id="color" name="color" maxLength={30} />
              </Field>
              <Field label={t("drive.plate")} htmlFor="plate" hint={t("drive.plateHint")} required>
                <Input id="plate" name="plate" required minLength={2} maxLength={20}
                       className="uppercase" placeholder="AA-123-BB" />
              </Field>
              <Field label={t("drive.seats")} htmlFor="seats" hint={t("drive.seatsHint")} required>
                <Input id="seats" name="seats" type="number" inputMode="numeric" min={1} max={60} required />
              </Field>
              <Field label={t("search.luggage")} htmlFor="luggage" required>
                <Input id="luggage" name="luggage" type="number" inputMode="numeric" min={0} max={60}
                       defaultValue={2} required />
              </Field>
            </div>

            <fieldset>
              <legend className="mb-2 block text-sm font-medium text-ink-800">{t("drive.amenities")}</legend>
              <div className="flex flex-wrap gap-x-6 gap-y-1">
                {AMENITIES.map(([name, key]) => (
                  <label key={name} className="flex min-h-11 items-center gap-2.5 text-sm text-ink-900">
                    <input type="checkbox" name={name} className="size-5 rounded border-ink-300" />
                    {t(key)}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="mb-2 block text-sm font-medium text-ink-800">{t("drive.capabilities")}</legend>
              <div className="flex flex-wrap gap-x-6 gap-y-1">
                {CAPABILITIES.map(([name, key]) => (
                  <label key={name} className="flex min-h-11 items-center gap-2.5 text-sm text-ink-900">
                    <input type="checkbox" name={name} className="size-5 rounded border-ink-300" />
                    {t(key)}
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs text-ink-500">{t("drive.capabilitiesHint")}</p>
            </fieldset>
          </fieldset>

          {/* -------------------------------------------------- consent --- */}
          <fieldset className="space-y-3 border-t border-ink-100 pt-8">
            <legend className="font-display text-lg text-ink-900">{t("drive.sec5")}</legend>

            <label className="flex items-start gap-3 text-sm leading-relaxed text-ink-900">
              <input type="checkbox" name="consent" required className="mt-0.5 size-5 shrink-0 rounded border-ink-300" />
              <span>
                {t("drive.consent")}{" "}
                <Link href={`/${locale}/legal/terms`} className="underline underline-offset-2">
                  {t("footer.terms")}
                </Link>{" "}·{" "}
                <Link href={`/${locale}/legal/privacy`} className="underline underline-offset-2">
                  {t("footer.privacy")}
                </Link>
              </span>
            </label>

            <button
              type="submit"
              className="min-h-12 w-full rounded-xl bg-gold-400 px-6 text-base font-bold text-pine-900 transition-colors hover:bg-gold-300 sm:w-auto"
            >
              {t("drive.submit")}
            </button>
            <p className="text-xs leading-relaxed text-ink-500">{t("drive.submitHint")}</p>
          </fieldset>
        </form>
      </Card>

      <p className="text-sm text-ink-600">
        {t("drive.alreadyApplied")}{" "}
        <Link href="/login" className="font-medium text-ink-900 underline underline-offset-2">
          {t("nav.signIn")}
        </Link>
      </p>
    </div>
  );
}
