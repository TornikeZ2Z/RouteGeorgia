import { notFound } from "next/navigation";
import { adminT, adminLocale } from "@/lib/i18n/admin";
import { formTokenMatches, AREAS } from "@/lib/change-requests";
import { Screenshots } from "./screenshots";

export const dynamic = "force-dynamic";
/** Never indexed, never followed. The URL is the only thing protecting it. */
export const metadata = { robots: { index: false, follow: false } };

/**
 * The team's change-request form.
 *
 * Four fields and a screenshot. Every box on a form nobody is obliged to fill
 * in is a reason to close the tab, so contact, reason and urgency were cut —
 * triage can set an urgency in the console, and the person who filed it is
 * reachable through whoever shared the link.
 *
 * No login: requiring one is exactly the friction that keeps the people worth
 * hearing from quiet. The unguessable segment in the URL is the gate, and a
 * wrong one is a 404 rather than a 403 — confirming the path exists is most
 * of the work of finding it.
 */
export default async function RequestFormPage({
  params, searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  if (!formTokenMatches(token)) notFound();

  const sp = await searchParams;
  const locale = adminLocale(String(sp.lang ?? "ka"));
  const t = adminT(locale);
  const sent = typeof sp.sent === "string" ? sp.sent : null;
  const error = typeof sp.error === "string" ? sp.error : null;

  const other = locale === "ka" ? "en" : "ka";
  const otherLabel = locale === "ka" ? "English" : "ქართული";

  const errorText =
    error === "image" ? t("cr.errImage")
    : error === "large" ? t("cr.errLarge")
    : error ? t("cr.errB")
    : null;

  return (
    <div className="min-h-screen bg-ink-50/50">
      <div className="mx-auto max-w-xl px-5 py-10 sm:py-16">
        <div className="mb-7 flex items-baseline justify-between gap-4">
          <h1 className="font-display text-2xl text-ink-900 sm:text-3xl">{t("cr.formTitle")}</h1>
          <a href={`/r/${token}?lang=${other}`} className="shrink-0 text-sm text-ink-500 hover:text-pine-800 hover:underline">
            {otherLabel}
          </a>
        </div>

        {sent ? (
          <div className="rounded-2xl border border-ink-200 bg-white p-7 text-center shadow-sm">
            <div className="mx-auto mb-4 flex size-11 items-center justify-center rounded-full bg-pine-50 text-pine-800">
              <svg viewBox="0 0 20 20" fill="currentColor" className="size-5" aria-hidden>
                <path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0Z" clipRule="evenodd" />
              </svg>
            </div>
            <h2 className="font-display text-xl text-ink-900">{t("cr.sentT")}</h2>
            <p className="mt-2 leading-relaxed text-ink-600">{t("cr.sentB", { ref: sent })}</p>
            <a
              href={`/r/${token}?lang=${locale}`}
              className="mt-6 inline-block rounded-lg bg-pine-800 px-4 py-2 text-sm font-medium text-white hover:bg-pine-900"
            >
              {t("cr.another")}
            </a>
          </div>
        ) : (
          <>
            <p className="mb-6 leading-relaxed text-ink-600">{t("cr.formLead")}</p>

            {errorText && (
              <div className="mb-5 rounded-xl border border-rust-200 bg-rust-50 px-4 py-3 text-sm text-rust-800">
                {errorText}
              </div>
            )}
            {sp.throttled === "1" && (
              <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <strong className="block">{t("cr.throttledT")}</strong>
                {t("cr.throttledB")}
              </div>
            )}

            {/*
              A plain multipart POST. The screenshot field enhances it with
              paste and drag-and-drop when JavaScript runs, and degrades to
              the file picker when it does not — so the form always submits.
            */}
            <form
              action="/api/change-requests" method="post" encType="multipart/form-data"
              className="space-y-6 rounded-2xl border border-ink-200 bg-white p-6 shadow-sm sm:p-7"
            >
              <input type="hidden" name="token" value={token} />
              <div className="absolute left-[-9999px]" aria-hidden>
                <label>Website<input type="text" name="website" tabIndex={-1} autoComplete="off" /></label>
              </div>

              <Step n={1} label={t("cr.nameL")} hint={t("cr.nameH")} htmlFor="name">
                <input id="name" name="name" required minLength={2} maxLength={120}
                       autoComplete="name" className={INPUT} />
              </Step>

              <Step n={2} label={t("cr.titleL")} htmlFor="title">
                <input id="title" name="title" required minLength={4} maxLength={160}
                       className={INPUT} />
              </Step>

              <Step n={3} label={t("cr.bodyL")} hint={t("cr.bodyH")} htmlFor="body">
                <textarea id="body" name="body" required minLength={10} maxLength={4000}
                          rows={5} className={INPUT} />
              </Step>

              <Step n={4} label={t("cr.areaL")} htmlFor="area">
                <select id="area" name="area" defaultValue="OTHER" className={INPUT}>
                  {AREAS.map((a) => (
                    <option key={a} value={a}>{t(`cr.a${a}` as Parameters<typeof t>[0])}</option>
                  ))}
                </select>
              </Step>

              <div className="border-t border-ink-100 pt-6">
                <Screenshots
                  labels={{
                    label: t("cr.shotsL"), hint: t("cr.shotsH"), pick: t("cr.shotsPick"),
                    drop: t("cr.shotsDrop"), remove: t("cr.shotsRemove"),
                    max: t("cr.shotsMax"), wrongType: t("cr.errImage"),
                  }}
                />
              </div>

              <button
                type="submit"
                className="w-full rounded-lg bg-pine-800 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-pine-900 focus:outline-none focus:ring-2 focus:ring-pine-800 focus:ring-offset-2"
              >
                {t("cr.submit")}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

const INPUT =
  "w-full rounded-lg border border-ink-300 bg-white px-3 py-2.5 text-sm text-ink-900 " +
  "placeholder:text-ink-400 focus:border-pine-800 focus:outline-none focus:ring-1 focus:ring-pine-800";

/**
 * A numbered field. The numbering is not decoration — there are four of them
 * and they are meant to be filled in order, which is the whole promise the
 * form is making: this will be quick.
 */
function Step({
  n, label, hint, htmlFor, children,
}: {
  n: number; label: string; hint?: string; htmlFor: string; children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-3">
      <span
        aria-hidden
        className="mt-0.5 flex size-7 items-center justify-center rounded-full bg-ink-100 text-xs font-semibold tabular-nums text-ink-500"
      >
        {n}
      </span>
      <div>
        <label htmlFor={htmlFor} className="block text-sm font-medium text-ink-900">{label}</label>
        {hint && <p className="mt-0.5 text-xs leading-relaxed text-ink-500">{hint}</p>}
        <div className="mt-2">{children}</div>
      </div>
    </div>
  );
}
