import { getTranslator, type Locale } from "@/lib/i18n";
import { Alert, Field, Input, Textarea } from "@/components/ui";

/**
 * Shared inquiry form for the business, school and hourly pages.
 *
 * Server-rendered plain form POST: no JavaScript required, outcome comes back
 * as ?sent=1 / ?error=1. The invisible "website" field is a honeypot.
 */
export function InquiryForm({
  locale, kind, sent = false, error = false, withCompany = false, withHourly = false,
  withVehicleTypes = false, withPackages = false,
}: {
  locale: Locale;
  kind: "business" | "school" | "hourly";
  sent?: boolean;
  error?: boolean;
  withCompany?: boolean;
  withHourly?: boolean;
  /** Business: which vehicle classes the company needs. */
  withVehicleTypes?: boolean;
  /** Schools: add-on service packages (chaperone, guide, …). */
  withPackages?: boolean;
}) {
  const t = getTranslator(locale);
  const paths = { business: "business", school: "schools", hourly: "hourly" } as const;

  if (sent) {
    return (
      <div id="inquiry">
        <Alert tone="success" title={t("inquiry.sent")}>{" "}</Alert>
      </div>
    );
  }

  return (
    <form id="inquiry" method="post" action="/api/inquiries" className="space-y-4">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="returnTo" value={`/${locale}/${paths[kind]}`} />
      <p className="hidden" aria-hidden>
        <label>
          website<input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </p>

      {error && <Alert tone="danger">{t("inquiry.error")}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("inquiry.name")} htmlFor="inq-name" required>
          <Input id="inq-name" name="name" required minLength={2} maxLength={120} autoComplete="name" />
        </Field>
        {withCompany && (
          <Field label={t("inquiry.company")} htmlFor="inq-company">
            <Input id="inq-company" name="company" maxLength={160} autoComplete="organization" />
          </Field>
        )}
        <Field label={t("inquiry.email")} htmlFor="inq-email" required>
          <Input id="inq-email" name="email" type="email" required maxLength={200} autoComplete="email" />
        </Field>
        <Field label={t("inquiry.phone")} htmlFor="inq-phone" required>
          <Input id="inq-phone" name="phone" type="tel" required minLength={6} maxLength={40} autoComplete="tel" />
        </Field>
        {withHourly && (
          <>
            <Field label={t("hourly.city")} htmlFor="inq-city" required>
              <Input id="inq-city" name="city" required maxLength={120} />
            </Field>
            <Field label={t("hourly.start")} htmlFor="inq-start" required>
              <Input id="inq-start" name="start" type="datetime-local" required />
            </Field>
            <Field label={t("hourly.hours")} htmlFor="inq-hours" required>
              <Input id="inq-hours" name="hours" type="number" min={1} max={16} defaultValue={4} required />
            </Field>
          </>
        )}
        <Field label={t("inquiry.passengers")} htmlFor="inq-pax">
          <Input id="inq-pax" name="passengers" type="number" min={1} max={60} />
        </Field>
      </div>

      {withVehicleTypes && (
        <fieldset>
          <legend className="mb-2 block text-sm font-medium text-ink-800">{t("inquiry.vehicleType")}</legend>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {([["sedan", "inquiry.veh1"], ["minivan", "inquiry.veh2"],
               ["minibus", "inquiry.veh3"], ["bus", "inquiry.veh4"]] as const).map(([value, key]) => (
              <label key={value} className="flex items-center gap-2 text-sm text-ink-900">
                <input type="checkbox" name="vehicleType" value={value} className="size-4 rounded border-ink-300" />
                {t(key)}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {withPackages && (
        <fieldset>
          <legend className="mb-2 block text-sm font-medium text-ink-800">{t("schools.pkgTitle")}</legend>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {([["chaperone", "schools.pkg1"], ["guide", "schools.pkg2"],
               ["meal-stop", "schools.pkg3"], ["extra-waiting", "schools.pkg4"]] as const).map(([value, key]) => (
              <label key={value} className="flex items-center gap-2 text-sm text-ink-900">
                <input type="checkbox" name="package" value={value} className="size-4 rounded border-ink-300" />
                {t(key)}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <Field label={t("inquiry.message")} htmlFor="inq-message" required>
        <Textarea id="inq-message" name="message" rows={5} required minLength={5} maxLength={2000} />
      </Field>

      <button
        type="submit"
        className="inline-flex min-h-12 items-center rounded-lg bg-brand-600 px-6 py-3 text-sm text-white shadow-[0_0_2px_0_rgba(0,0,0,.16)] transition-colors hover:bg-brand-700"
      >
        {t("inquiry.send")}
      </button>
    </form>
  );
}
