import { notFound } from "next/navigation";
import { adminT, adminLocale } from "@/lib/i18n/admin";
import { formTokenMatches, AREAS, URGENCIES } from "@/lib/change-requests";
import { Alert, Card } from "@/components/ui";

export const dynamic = "force-dynamic";
/** Never indexed, never followed. The URL is the only thing protecting it. */
export const metadata = { robots: { index: false, follow: false } };

/**
 * The team's change-request form.
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

  const other = locale === "ka" ? "en" : "ka";
  const otherLabel = locale === "ka" ? "English" : "ქართული";

  return (
    <div className="mx-auto max-w-2xl px-5 py-12 sm:py-16">
      <div className="mb-8 flex items-baseline justify-between gap-4">
        <h1 className="font-display text-3xl text-ink-900">{t("cr.formTitle")}</h1>
        <a href={`/r/${token}?lang=${other}`} className="text-sm text-pine-800 hover:underline">
          {otherLabel}
        </a>
      </div>

      {sent ? (
        <Card className="p-6 sm:p-8">
          <Alert tone="success" title={t("cr.sentT")}>
            {t("cr.sentB", { ref: sent })}
          </Alert>
          <p className="mt-5">
            <a href={`/r/${token}?lang=${locale}`} className="text-pine-800 hover:underline">
              {t("cr.another")}
            </a>
          </p>
        </Card>
      ) : (
        <>
          <p className="mb-6 leading-relaxed text-ink-600">{t("cr.formLead")}</p>

          {sp.error === "1" && (
            <Alert tone="danger" title={t("cr.errT")}>{t("cr.errB")}</Alert>
          )}
          {sp.throttled === "1" && (
            <Alert tone="warning" title={t("cr.throttledT")}>{t("cr.throttledB")}</Alert>
          )}

          <Card className="mt-4 p-6 sm:p-8">
            {/*
              A plain form POST with no client JavaScript. The people this is
              for will open it on a phone with a poor connection, and a form
              that needs a bundle to submit is a form that sometimes does not.
            */}
            <form action="/api/change-requests" method="post" className="space-y-5">
              <input type="hidden" name="token" value={token} />
              {/* Honeypot — positioned off-screen rather than display:none,
                  which some bots check for. */}
              <div className="absolute left-[-9999px]" aria-hidden>
                <label>
                  Website
                  <input type="text" name="website" tabIndex={-1} autoComplete="off" />
                </label>
              </div>

              <Field label={t("cr.nameL")} hint={t("cr.nameH")} htmlFor="name" required>
                <input id="name" name="name" required minLength={2} maxLength={120}
                       autoComplete="name" className={INPUT} />
              </Field>

              <Field label={t("cr.contactL")} hint={t("cr.contactH")} htmlFor="contact">
                <input id="contact" name="contact" maxLength={200} className={INPUT} />
              </Field>

              <Field label={t("cr.titleL")} htmlFor="title" required>
                <input id="title" name="title" required minLength={4} maxLength={160}
                       className={INPUT} />
              </Field>

              <Field label={t("cr.bodyL")} hint={t("cr.bodyH")} htmlFor="body" required>
                <textarea id="body" name="body" required minLength={10} maxLength={4000}
                          rows={6} className={INPUT} />
              </Field>

              <Field label={t("cr.reasonL")} hint={t("cr.reasonH")} htmlFor="reason">
                <textarea id="reason" name="reason" maxLength={2000} rows={3} className={INPUT} />
              </Field>

              <div className="grid gap-5 sm:grid-cols-2">
                <Field label={t("cr.areaL")} htmlFor="area" required>
                  <select id="area" name="area" defaultValue="OTHER" className={INPUT}>
                    {AREAS.map((a) => (
                      <option key={a} value={a}>{t(`cr.a${a}` as Parameters<typeof t>[0])}</option>
                    ))}
                  </select>
                </Field>
                <Field label={t("cr.urgencyL")} htmlFor="urgency" required>
                  <select id="urgency" name="urgency" defaultValue="NORMAL" className={INPUT}>
                    {URGENCIES.map((u) => (
                      <option key={u} value={u}>{t(`cr.u${u}` as Parameters<typeof t>[0])}</option>
                    ))}
                  </select>
                </Field>
              </div>

              <button type="submit" className="btn-primary w-full sm:w-auto">
                {t("cr.submit")}
              </button>
            </form>
          </Card>
        </>
      )}
    </div>
  );
}

const INPUT =
  "w-full rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm " +
  "focus:border-pine-800 focus:outline-none focus:ring-1 focus:ring-pine-800";

function Field({
  label, hint, htmlFor, required, children,
}: {
  label: string; hint?: string; htmlFor: string; required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink-900">
        {label}{required && <span className="text-ink-400"> *</span>}
      </label>
      {hint && <p className="mt-0.5 text-xs leading-relaxed text-ink-500">{hint}</p>}
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
