import { sql } from "@db/client";
import { adminT } from "@/lib/i18n/admin";

/**
 * Why this driver is, or is not, live.
 *
 * Publishing has six conditions, and until now the reviewer met them one at a
 * time as red text after pressing a button that failed. Approving a driver
 * looked like it should be enough, so when nothing happened the obvious
 * conclusion was that approval was broken — it was not, it is one of six.
 *
 * The same conditions are enforced in publishDriverAction and, for the
 * signature, by a database trigger. This panel only reports them: it is a
 * mirror, never the authority. If the two ever disagree the action wins, and
 * that is the bug to fix.
 *
 * Each line also says who has to act, because four of the six are the
 * driver's to do and no amount of clicking in the console will complete them.
 */
export async function ReadinessPanel({
  driverId, status, published, locale,
}: { driverId: string; status: string; published: boolean; locale: string }) {
  const t = adminT(locale);

  const [g] = await sql<GateRow[]>`
    SELECT
      (SELECT count(*) FROM driver_documents dd
        WHERE dd.driver_id = ${driverId}::uuid AND dd.type::text = 'IDENTITY'
          AND dd.state = 'APPROVED')::int AS identity_ok,
      (SELECT count(*) FROM driver_documents dd
        WHERE dd.driver_id = ${driverId}::uuid AND dd.type::text = 'DRIVING_LICENSE'
          AND dd.state = 'APPROVED')::int AS licence_ok,
      (SELECT count(*) FROM driver_documents dd
        WHERE dd.driver_id = ${driverId}::uuid AND dd.type::text IN ('IDENTITY','DRIVING_LICENSE')
          AND dd.state = 'PENDING')::int AS docs_pending,
      (SELECT count(*) FROM driver_documents
        WHERE driver_id = ${driverId}::uuid AND is_mandatory
          AND expires_on IS NOT NULL AND expires_on < current_date)::int AS expired,
      (SELECT count(*) FROM vehicles WHERE driver_id = ${driverId}::uuid)::int AS vehicles,
      (SELECT count(*) FROM vehicles WHERE driver_id = ${driverId}::uuid
        AND status = 'APPROVED')::int AS vehicles_ok,
      (SELECT count(*) FROM vehicles WHERE driver_id = ${driverId}::uuid
        AND status = 'SUBMITTED')::int AS vehicles_pending,
      (SELECT count(*) FROM price_plans WHERE driver_id = ${driverId}::uuid
        AND status = 'ACTIVE')::int AS plans,
      current_contract_version() AS live_contract,
      (SELECT count(*) FROM contract_signatures s
        WHERE s.driver_id = ${driverId}::uuid
          AND s.contract_version = current_contract_version())::int AS signed`;

  const approved = status === "APPROVED";
  const contractNeeded = Boolean(g?.live_contract);

  const steps: Step[] = [
    {
      done: approved,
      label: t("ready.reviewed"),
      actor: "staff",
      note: approved ? null : t("ready.reviewedNote"),
    },
    {
      done: (g?.identity_ok ?? 0) > 0,
      label: t("ready.identity"),
      actor: (g?.docs_pending ?? 0) > 0 ? "staff" : "driver",
      note: (g?.identity_ok ?? 0) > 0
        ? null
        : (g?.docs_pending ?? 0) > 0 ? t("ready.docWaiting") : t("ready.docMissing"),
    },
    {
      done: (g?.licence_ok ?? 0) > 0,
      label: t("ready.licence"),
      actor: (g?.docs_pending ?? 0) > 0 ? "staff" : "driver",
      note: (g?.licence_ok ?? 0) > 0
        ? null
        : (g?.docs_pending ?? 0) > 0 ? t("ready.docWaiting") : t("ready.docMissing"),
    },
    {
      done: (g?.vehicles_ok ?? 0) > 0,
      label: t("ready.vehicle"),
      actor: (g?.vehicles_pending ?? 0) > 0 ? "staff" : "driver",
      note: (g?.vehicles_ok ?? 0) > 0
        ? null
        : (g?.vehicles_pending ?? 0) > 0
          ? t("ready.vehicleWaiting")
          : (g?.vehicles ?? 0) > 0 ? t("ready.vehicleRejected") : t("ready.vehicleMissing"),
    },
    {
      done: (g?.plans ?? 0) > 0,
      label: t("ready.pricing"),
      actor: "driver",
      note: (g?.plans ?? 0) > 0 ? null : t("ready.pricingNote"),
    },
  ];

  if (contractNeeded) {
    steps.push({
      done: (g?.signed ?? 0) > 0,
      label: t("ready.contract", { version: g!.live_contract! }),
      actor: "driver",
      note: (g?.signed ?? 0) > 0 ? null : t("ready.contractNote"),
    });
  }

  if ((g?.expired ?? 0) > 0) {
    steps.push({ done: false, label: t("ready.expired"), actor: "driver", note: t("ready.expiredNote") });
  }

  const outstanding = steps.filter((s) => !s.done);
  const ready = outstanding.length === 0;

  return (
    <section className="rounded-xl border border-ink-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold text-ink-900">{t("ready.title")}</h3>
        <span
          className={
            published
              ? "rounded-full bg-[--color-success]/10 px-2.5 py-1 text-xs font-semibold text-[--color-success]"
              : ready
                ? "rounded-full bg-gold-100 px-2.5 py-1 text-xs font-semibold text-gold-700"
                : "rounded-full bg-ink-100 px-2.5 py-1 text-xs font-semibold text-ink-600"
          }
        >
          {published ? t("ready.live") : ready ? t("ready.readyNow") : t("ready.stepsLeft", { count: outstanding.length })}
        </span>
      </div>

      <p className="mt-1 text-sm text-ink-600">
        {published ? t("ready.liveBody") : ready ? t("ready.readyBody") : t("ready.blockedBody")}
      </p>

      <ol className="mt-4 space-y-2.5">
        {steps.map((step) => (
          <li key={step.label} className="flex gap-3">
            <span
              aria-hidden
              className={
                step.done
                  ? "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-[--color-success] text-white"
                  : "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-ink-300 bg-white"
              }
            >
              {step.done && (
                <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor"
                     strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m5 12 5 5L20 7" />
                </svg>
              )}
            </span>
            <span className="min-w-0">
              <span className={step.done ? "text-sm text-ink-500 line-through" : "text-sm font-medium text-ink-900"}>
                {step.label}
              </span>
              {!step.done && (
                <span className="mt-0.5 flex flex-wrap items-center gap-2">
                  <span
                    className={
                      step.actor === "staff"
                        ? "rounded bg-brand-600/10 px-1.5 py-0.5 text-[11px] font-semibold text-brand-600"
                        : "rounded bg-ink-100 px-1.5 py-0.5 text-[11px] font-semibold text-ink-600"
                    }
                  >
                    {step.actor === "staff" ? t("ready.actorYou") : t("ready.actorDriver")}
                  </span>
                  {step.note && <span className="text-xs text-ink-500">{step.note}</span>}
                </span>
              )}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

interface Step {
  done: boolean;
  label: string;
  /** Who has to do something next — four of the six are the driver's. */
  actor: "staff" | "driver";
  note: string | null;
}

interface GateRow {
  identity_ok: number; licence_ok: number; docs_pending: number; expired: number;
  vehicles: number; vehicles_ok: number; vehicles_pending: number;
  plans: number; live_contract: string | null; signed: number;
}
