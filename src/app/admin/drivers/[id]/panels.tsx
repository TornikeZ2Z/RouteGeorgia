"use client";

import { useActionState } from "react";
import { Alert, Card, Field, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/form-state";
import {
  decideDriverAction, decideDocumentAction, decideVehicleAction,
  verifyLanguageAction, publishDriverAction, uploadDriverDocumentAction,
} from "@/app/admin/actions";
import { Input } from "@/components/ui";
import { adminT, driverStatusLabel } from "@/lib/i18n/admin";

const INITIAL = { ok: false } as const;

function Result({ state }: { state: { ok: boolean; message?: string; errors?: string[] } }) {
  if (!state.message && !state.errors?.length) return null;
  return (
    <div className="mt-2">
      <Alert tone={state.ok ? "success" : "danger"}>
        {state.message}
        {state.errors?.length ? (
          <ul className="mt-1 list-inside list-disc">{state.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
        ) : null}
      </Alert>
    </div>
  );
}

/** Driver-level decision. A written reason is mandatory and audited. */
export function DecisionPanel({ driverId, currentStatus, locale }: { driverId: string; currentStatus: string; locale: string }) {
  const [state, action] = useActionState(decideDriverAction, INITIAL);
  const t = adminT(locale);
  return (
    <Card className="p-4">
      <h3 className="font-semibold text-ink-900">{t("decision.title")}</h3>
      <p className="mt-1 text-xs text-ink-500">{t("decision.current")}: {driverStatusLabel(currentStatus, locale)}</p>
      <form action={action} className="mt-3 space-y-3">
        <input type="hidden" name="driverId" value={driverId} />
        <Field label={t("decision.setStatus")} htmlFor="decision">
          <Select id="decision" name="decision" defaultValue="IN_REVIEW">
            <option value="IN_REVIEW">{t("common.inReview")}</option>
            <option value="CHANGES_REQUESTED">{t("common.requestChanges")}</option>
            <option value="APPROVED">{t("common.approve")}</option>
            <option value="REJECTED">{t("common.reject")}</option>
            <option value="SUSPENDED">{t("common.suspend")}</option>
          </Select>
        </Field>
        <Field label={t("common.reason")} htmlFor="reason" hint={t("decision.reasonHint")} required>
          <Textarea id="reason" name="reason" rows={3} required minLength={10} />
        </Field>
        <SubmitButton>{t("decision.record")}</SubmitButton>
      </form>
      <Result state={state} />
    </Card>
  );
}

/** Publication is separate from approval and separately permissioned. */
export function PublishPanel({ driverId, published, locale }: { driverId: string; published: boolean; locale: string }) {
  const [state, action] = useActionState(publishDriverAction, INITIAL);
  const t = adminT(locale);
  return (
    <Card className="p-4">
      <h3 className="font-semibold text-ink-900">{t("publish.title")}</h3>
      <p className="mt-1 text-xs text-ink-500">
        {published ? t("publish.visible") : t("publish.hidden")}
      </p>
      <form action={action} className="mt-3 space-y-3">
        <input type="hidden" name="driverId" value={driverId} />
        <input type="hidden" name="publish" value={published ? "false" : "true"} />
        <Field label={t("common.reason")} htmlFor="publishReason" required>
          <Textarea id="publishReason" name="reason" rows={2} required minLength={10} />
        </Field>
        <SubmitButton variant={published ? "secondary" : "primary"}>
          {published ? t("publish.remove") : t("publish.publish")}
        </SubmitButton>
      </form>
      <Result state={state} />
    </Card>
  );
}

export function DocumentDecision({ documentId, driverId, locale }: { documentId: string; driverId: string; locale: string }) {
  const [state, action] = useActionState(decideDocumentAction, INITIAL);
  const t = adminT(locale);
  return (
    <form action={action} className="flex flex-col gap-1.5">
      <input type="hidden" name="documentId" value={documentId} />
      <input type="hidden" name="driverId" value={driverId} />
      <Select name="state" defaultValue="APPROVED" aria-label={t("col.decision")} className="text-xs">
        <option value="APPROVED">{t("common.approve")}</option>
        <option value="CHANGES_REQUESTED">{t("common.requestChanges")}</option>
        <option value="REJECTED">{t("common.reject")}</option>
      </Select>
      <input
        name="reason" placeholder={t("common.reason")} required minLength={5}
        className="rounded border border-ink-300 px-2 py-1 text-xs"
      />
      <SubmitButton variant="secondary">{t("common.save")}</SubmitButton>
      {!state.ok && state.message && <span className="text-xs text-[--color-danger]">{state.message}</span>}
    </form>
  );
}

export function VehicleDecision({ vehicleId, driverId, locale }: { vehicleId: string; driverId: string; locale: string }) {
  const [state, action] = useActionState(decideVehicleAction, INITIAL);
  const t = adminT(locale);
  return (
    <form action={action} className="flex flex-col gap-1.5">
      <input type="hidden" name="vehicleId" value={vehicleId} />
      <input type="hidden" name="driverId" value={driverId} />
      <Select name="status" defaultValue="APPROVED" aria-label={t("col.decision")} className="text-xs">
        <option value="APPROVED">{t("common.approve")}</option>
        <option value="SUSPENDED">{t("common.suspend")}</option>
        <option value="RETIRED">{t("common.retire")}</option>
      </Select>
      <label className="flex items-center gap-1.5 text-xs">
        <input type="checkbox" name="publish" value="true" className="size-3.5" /> {t("common.publishWord")}
      </label>
      <input
        name="reason" placeholder={t("common.reason")} required minLength={5}
        className="rounded border border-ink-300 px-2 py-1 text-xs"
      />
      <SubmitButton variant="secondary">{t("common.save")}</SubmitButton>
      {!state.ok && state.message && <span className="text-xs text-[--color-danger]">{state.message}</span>}
    </form>
  );
}

export function LanguageVerification({ driverId, language, locale }: { driverId: string; language: string; locale: string }) {
  const [state, action] = useActionState(verifyLanguageAction, INITIAL);
  const t = adminT(locale);
  return (
    <form action={action} className="flex items-center gap-1.5">
      <input type="hidden" name="driverId" value={driverId} />
      <input type="hidden" name="language" value={language} />
      <Select name="verifiedLevel" defaultValue="CONVERSATIONAL" aria-label={`${t("col.verified")} — ${language}`} className="text-xs">
        <option value="BASIC">{t("lvl.BASIC")}</option>
        <option value="CONVERSATIONAL">{t("lvl.CONVERSATIONAL")}</option>
        <option value="FLUENT">{t("lvl.FLUENT")}</option>
        <option value="NATIVE">{t("lvl.NATIVE")}</option>
      </Select>
      <SubmitButton variant="secondary">{t("common.set")}</SubmitButton>
      {!state.ok && state.message && <span className="text-xs text-[--color-danger]">{state.message}</span>}
    </form>
  );
}

/** Scan-and-upload across the desk: lands as PENDING for normal review. */
export function UploadDocumentPanel({
  driverId, vehicles, locale,
}: { driverId: string; vehicles: { id: string; label: string }[]; locale: string }) {
  const [state, action] = useActionState(uploadDriverDocumentAction, INITIAL);
  const t = adminT(locale);
  return (
    <Card className="p-4">
      <h3 className="font-semibold text-ink-900">{t("upload.title")}</h3>
      <p className="mt-1 text-xs text-ink-500">{t("upload.body")}</p>
      <form action={action} className="mt-3 space-y-3">
        <input type="hidden" name="driverId" value={driverId} />
        <Field label={t("col.type")} htmlFor="staff-doc-type">
          <Select id="staff-doc-type" name="type" defaultValue="DRIVING_LICENSE">
            <option value="IDENTITY">{t("doc.IDENTITY")}</option>
            <option value="DRIVING_LICENSE">{t("doc.DRIVING_LICENSE")}</option>
            <option value="VEHICLE_REGISTRATION">{t("doc.VEHICLE_REGISTRATION")}</option>
            <option value="INSURANCE">{t("doc.INSURANCE")}</option>
            <option value="INSPECTION">{t("doc.INSPECTION")}</option>
          </Select>
        </Field>
        {vehicles.length > 0 && (
          <Field label={t("upload.vehicle")} htmlFor="staff-doc-vehicle">
            <Select id="staff-doc-vehicle" name="vehicleId" defaultValue="">
              <option value="">{t("upload.notVehicleSpecific")}</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
            </Select>
          </Field>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("upload.expiry")} htmlFor="staff-doc-expiry" hint={t("upload.expiryHint")}>
            <Input id="staff-doc-expiry" name="expiresOn" type="date" />
          </Field>
          <Field label={t("upload.number")} htmlFor="staff-doc-number" hint={t("upload.numberHint")}>
            <Input id="staff-doc-number" name="number" maxLength={64} />
          </Field>
        </div>
        <Field label={t("upload.file")} htmlFor="staff-doc-file" required>
          <Input id="staff-doc-file" name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required />
        </Field>
        <SubmitButton>{t("upload.submit")}</SubmitButton>
      </form>
      <Result state={state} />
    </Card>
  );
}
