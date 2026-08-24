import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { sql } from "@db/client";
import { Badge, EmptyState, PageHeader, Table } from "@/components/ui";
import { adminT, driverStatusLabel } from "@/lib/i18n/admin";
import { CreateDriverForm } from "./forms";

export const dynamic = "force-dynamic";

const TONES: Record<string, "neutral" | "info" | "success" | "warning" | "danger"> = {
  DRAFT: "neutral", SUBMITTED: "info", IN_REVIEW: "info", CHANGES_REQUESTED: "warning",
  APPROVED: "success", SUSPENDED: "danger", REJECTED: "danger",
};

export default async function DriversList({
  searchParams,
}: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const user = await requirePermission("admin.drivers.read");
  const t = adminT(user.locale);
  const { status } = await searchParams;
  const q = (await searchParams).q?.trim() || "";

  const locations = await sql<{ id: string; name_en: string }[]>`
    SELECT id, name_en FROM locations ORDER BY name_en`;

  /**
   * One box that finds a driver however the caller describes them: the name
   * on screen, the legal name, the address they sign in with, the phone they
   * ring from, or the plate of the car outside.
   */
  const like = `%${q}%`;
  const rows = await sql<Row[]>`
    SELECT d.id, d.public_name, d.handle, d.status::text AS status, d.published,
           d.completed_trips, d.rating_sum, d.rating_count,
           u.email, u.phone,
           (SELECT count(*) FROM vehicles v WHERE v.driver_id = d.id)::int AS vehicles
    FROM driver_profiles d
    JOIN users u ON u.id = d.user_id
    WHERE (${status || null}::driver_status IS NULL OR d.status = ${status || null}::driver_status)
      AND (${q} = '' OR
           d.public_name ILIKE ${like} OR d.handle ILIKE ${like} OR
           coalesce(d.legal_first_name, '') ILIKE ${like} OR
           coalesce(d.legal_last_name, '') ILIKE ${like} OR
           u.email ILIKE ${like} OR coalesce(u.phone, '') ILIKE ${like} OR
           EXISTS (SELECT 1 FROM vehicles v WHERE v.driver_id = d.id AND v.plate ILIKE ${like}))
    ORDER BY d.created_at DESC LIMIT 200`;

  /** Status filter links keep the current search; the search keeps the filter. */
  const filter = (s?: string) => {
    const params = new URLSearchParams();
    if (s) params.set("status", s);
    if (q) params.set("q", q);
    const qs = params.toString();
    return `/admin/drivers${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("drivers.title")}
        description={`${rows.length} ${t("drivers.records")}`}
        actions={<CreateDriverForm locations={locations} locale={user.locale} />}
      />

      <div className="flex flex-wrap items-center gap-2">
        <form action="/admin/drivers" method="get" role="search" className="flex min-w-0 grow gap-2 sm:max-w-md">
          {status && <input type="hidden" name="status" value={status} />}
          <label htmlFor="drivers-q" className="sr-only">{t("drivers.searchLabel")}</label>
          <input
            id="drivers-q" type="search" name="q" defaultValue={q}
            placeholder={t("drivers.searchHint")}
            className="w-full rounded-xl border border-ink-300 bg-white px-3.5 py-2 text-sm placeholder:text-ink-400 focus:border-ink-900"
          />
          <button className="rounded-xl bg-pine-800 px-4 py-2 text-sm font-medium text-white hover:bg-pine-700">
            {t("drivers.searchLabel")}
          </button>
        </form>

        <nav className="flex flex-wrap gap-1.5 text-sm" aria-label="Filter by status">
          <Link
            href={filter()}
            className={!status ? "rounded-lg bg-pine-800 px-3 py-1.5 text-white" : "rounded-lg border border-ink-200 bg-white px-3 py-1.5 hover:bg-ink-50"}
          >
            {t("drivers.all")}
          </Link>
          {Object.keys(TONES).map((s) => (
            <Link
              key={s} href={filter(s)}
              className={status === s ? "rounded-lg bg-pine-800 px-3 py-1.5 text-white" : "rounded-lg border border-ink-200 bg-white px-3 py-1.5 hover:bg-ink-50"}
            >
              {driverStatusLabel(s, user.locale)}
            </Link>
          ))}
        </nav>
      </div>

      {rows.length === 0 ? (
        <EmptyState title={t("drivers.noResults")} />
      ) : (
        <Table head={[t("drivers.colDriver"), t("drivers.colContact"), t("drivers.colStatus"), t("drivers.colLive"),
                      t("drivers.colVehicles"), t("drivers.colTrips"), t("drivers.colRating"), ""]}>
          {rows.map((d) => (
            <tr key={d.id}>
              <td className="px-4 py-2.5">
                <p className="font-medium text-ink-900">{d.public_name}</p>
                <p className="text-xs text-ink-500">@{d.handle}</p>
              </td>
              <td className="px-4 py-2.5">
                <p className="text-xs text-ink-600">{d.email}</p>
                {d.phone && <p className="text-xs text-ink-500">{d.phone}</p>}
              </td>
              <td className="px-4 py-2.5">
                <Badge tone={TONES[d.status] ?? "neutral"}>{driverStatusLabel(d.status, user.locale)}</Badge>
              </td>
              <td className="px-4 py-2.5">{d.published ? <Badge tone="success">{t("drivers.live")}</Badge> : "—"}</td>
              <td className="px-4 py-2.5 tabular-nums">{d.vehicles}</td>
              <td className="px-4 py-2.5 tabular-nums">{d.completed_trips}</td>
              <td className="px-4 py-2.5 tabular-nums">
                {d.rating_count > 0 ? `${(d.rating_sum / d.rating_count).toFixed(1)} (${d.rating_count})` : "—"}
              </td>
              <td className="px-4 py-2.5 text-right">
                <Link href={`/admin/drivers/${d.id}`} className="text-ink-900 underline">{t("drivers.open")}</Link>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

interface Row {
  id: string; public_name: string; handle: string; status: string; published: boolean;
  completed_trips: number; rating_sum: number; rating_count: number; vehicles: number;
  email: string; phone: string | null;
}
