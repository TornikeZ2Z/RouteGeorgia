import { requireUser } from "@/lib/auth/session";
import { sql } from "@db/client";
import { getTranslator, isLocale, type Locale } from "@/lib/i18n";
import { Alert, Badge, Card, PageHeader } from "@/components/ui";
import {
  getActiveContract, getSignature, parseContract, companyDetailsComplete,
} from "@/lib/contract";
import { SignContract } from "./sign";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

export default async function ContractPage() {
  const user = await requireUser();
  const locale = (isLocale(user.locale) ? user.locale : "ka") as Locale;
  const t = getTranslator(locale);

  const [driver] = await sql<{ id: string; status: string; legal_first_name: string | null; legal_last_name: string | null }[]>`
    SELECT id, status::text AS status, legal_first_name, legal_last_name
    FROM driver_profiles WHERE user_id = ${user.id}::uuid`;

  const [contract, signature] = await Promise.all([
    getActiveContract(locale),
    driver ? getSignature(driver.id) : Promise.resolve(null),
  ]);

  const ready = contract !== null && companyDetailsComplete();
  const approved = driver?.status === "APPROVED";

  const dateFmt = (d: Date) =>
    new Date(d).toLocaleDateString(locale === "ka" ? "ka-GE" : locale === "ru" ? "ru-RU" : "en-GB",
      { dateStyle: "long" });

  return (
    <div className="space-y-6">
      <PageHeader
        title={contract?.title ?? t("contract.navTitle")}
        description={contract ? t("contract.effective", { date: dateFmt(contract.effectiveFrom) }) : undefined}
        actions={signature ? <Badge tone="success">{t("contract.signedBadge")}</Badge> : undefined}
      />

      {/* Nothing to sign yet, for one of two very different reasons. */}
      {!ready && (
        <Alert tone="info" title={t("contract.notReady")}>{t("contract.notReadyBody")}</Alert>
      )}

      {ready && !approved && !signature && (
        <Alert tone="info" title={t("contract.pending")}>{t("contract.pendingBody")}</Alert>
      )}

      {signature && (
        <Alert tone="success" title={t("contract.signedTitle")}>
          {t("contract.signedBody", {
            name: signature.signedName,
            date: dateFmt(signature.signedAt),
            version: signature.contractVersion,
          })}
        </Alert>
      )}

      {contract && (
        <Card className="p-5 sm:p-8">
          <article className="prose-contract max-w-none">
            {(() => {
              const { intro, sections } = parseContract(contract.body);
              return (
                <>
                  {intro.map((p, i) => (
                    <p key={`intro-${i}`} className="text-base leading-relaxed text-ink-700">{p}</p>
                  ))}
                  {sections.map((section) => (
                    <section key={section.heading} className="mt-8">
                      <h2 className="font-display text-xl text-ink-900">{section.heading}</h2>
                      <div className="rule-fade mt-2" />
                      <div className="mt-3 space-y-3">
                        {section.paragraphs.map((p, i) => (
                          <p key={i} className="leading-relaxed text-ink-700">{p}</p>
                        ))}
                      </div>
                    </section>
                  ))}
                </>
              );
            })()}
          </article>

          <p className="mt-8 border-t border-ink-100 pt-4 text-xs leading-relaxed text-ink-500">
            {t("contract.langNote")} · {t("contract.versionLine", { version: contract.version })}
          </p>
        </Card>
      )}

      {/* The signing block only appears when signing is actually possible. */}
      {ready && approved && !signature && contract && (
        <SignContract
          locale={locale}
          bodyHash={contract.bodyHash}
          suggestedName={[driver?.legal_first_name, driver?.legal_last_name].filter(Boolean).join(" ")}
        />
      )}
    </div>
  );
}
