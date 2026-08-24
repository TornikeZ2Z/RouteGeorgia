import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { sql } from "@db/client";
import { Alert, Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { getTranslator, isLocale, type Locale } from "@/lib/i18n";
import { getActiveContract, getSignature, companyDetailsComplete } from "@/lib/contract";

export const dynamic = "force-dynamic";

const STATUS_TONE = {
  DRAFT: "neutral", SUBMITTED: "info", IN_REVIEW: "info",
  CHANGES_REQUESTED: "warning", APPROVED: "success",
  SUSPENDED: "danger", REJECTED: "danger",
} as const;

export default async function DriverHome() {
  const user = await requireUser();

  const [driver] = await sql<DriverRow[]>`
    SELECT id, handle, public_name, status::text AS status, published
    FROM driver_profiles WHERE user_id = ${user.id}::uuid`;

  const tEarly = getTranslator((isLocale(user.locale) ? user.locale : "ka") as Locale);
  if (!driver) {
    return (
      <EmptyState title={tEarly("console.noProfileT")}>
        <Link className="text-ink-900 underline" href="/driver/application">{tEarly("console.noProfileB")}</Link>
      </EmptyState>
    );
  }

  const [docs, vehicles, blocks] = await Promise.all([
    sql<{ type: string; state: string; expires_on: string | null }[]>`
      SELECT type::text, state::text, expires_on FROM driver_documents
      WHERE driver_id = ${driver.id}::uuid ORDER BY type`,
    sql<{ id: string; make: string; model: string; status: string; published: boolean }[]>`
      SELECT id, make, model, status::text, published FROM vehicles WHERE driver_id = ${driver.id}::uuid`,
    sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM availability_blocks
      WHERE driver_id = ${driver.id}::uuid AND upper(period) > now()`,
  ]);

  // The one thing standing between an approved driver and going live.
  const [contract, signature] = await Promise.all([
    getActiveContract(user.locale),
    getSignature(driver.id),
  ]);
  const contractDue =
    driver.status === "APPROVED" && contract !== null && companyDetailsComplete() && signature === null;
  const t = getTranslator((isLocale(user.locale) ? user.locale : "ka") as Locale);

  const expiringSoon = docs.filter(
    (d) => d.expires_on && new Date(d.expires_on).getTime() < Date.now() + 30 * 86_400_000,
  );
  const pending = docs.filter((d) => d.state !== "APPROVED");

  return (
    <div className="space-y-6">
      <PageHeader
        title={driver.public_name}
        description={t("console.profileStatus", { status: t(("console.st" + driver.status) as Parameters<typeof t>[0]) })}
        actions={
          <Badge tone={STATUS_TONE[driver.status as keyof typeof STATUS_TONE]}>
            {t(("console.st" + driver.status) as Parameters<typeof t>[0])}
          </Badge>
        }
      />

      {/* Documents moved out of the application form, so for a fresh
          applicant this banner IS the onboarding: nothing else can move
          until identity and licence exist. */}
      {(!docs.some((d) => d.type === "IDENTITY") || !docs.some((d) => d.type === "DRIVING_LICENSE")) && (
        <Alert tone="warning" title={t("console.docsNeededTitle")}>
          <p className="leading-relaxed">{t("console.docsNeededBody")}</p>
          <Link
            href="/driver/documents"
            className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-gold-400 px-4 text-sm font-bold text-pine-900 hover:bg-gold-300"
          >
            {t("console.docsNeededCta")}
          </Link>
        </Alert>
      )}

      {contractDue && (
        <Alert tone="warning" title={t("contract.bannerTitle")}>
          <p className="leading-relaxed">{t("contract.bannerBody")}</p>
          <Link
            href="/driver/contract"
            className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-gold-400 px-4 text-sm font-bold text-pine-900 hover:bg-gold-300"
          >
            {t("contract.bannerCta")}
          </Link>
        </Alert>
      )}

      {driver.status === "CHANGES_REQUESTED" && (
        <Alert tone="warning" title={t("console.changesReqT")}>{t("console.changesReqB")}</Alert>
      )}

      {expiringSoon.length > 0 && (
        <Alert tone="warning" title={t("console.expiringT")}>
          {expiringSoon.map((d) => `${d.type.replaceAll("_", " ").toLowerCase()} (${d.expires_on})`).join(", ")}.{" "}
          {t("console.expiringB")}
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-sm text-ink-500">{t("console.statVehicles")}</p>
          <p className="mt-1 text-2xl font-semibold">{vehicles.length}</p>
          <p className="mt-1 text-xs text-ink-500">
            {t("console.statPublishedCount", { count: vehicles.filter((v) => v.published).length })}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-ink-500">{t("console.statDocsPending")}</p>
          <p className="mt-1 text-2xl font-semibold">{pending.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-ink-500">{t("console.statBlocks")}</p>
          <p className="mt-1 text-2xl font-semibold">{blocks[0]?.n ?? 0}</p>
        </Card>
      </div>

      {driver.published && (
        <Alert tone="success" title={t("console.liveT")}>
          {t("console.liveB")}{" "}
          <Link className="underline" href={`/${isLocale(user.locale) ? user.locale : "ka"}/drivers/${driver.handle}`}>
            {t("console.viewPublic")}
          </Link>
        </Alert>
      )}
    </div>
  );
}

interface DriverRow { id: string; handle: string; public_name: string; status: string; published: boolean }
