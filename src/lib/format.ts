/**
 * Human durations.
 *
 * "about 0 h driving" appeared on every route under an hour — technically the
 * result of integer division, and immediately reads as broken. Sub-hour
 * trips are stated in minutes, and hours are only rounded once there are
 * enough of them for rounding to be honest.
 */
export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "—";
  if (minutes < 60) return `${Math.round(minutes / 5) * 5} min`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest === 0) return `${hours} h`;
  if (rest < 8) return `${hours} h`;
  if (rest > 52) return `${hours + 1} h`;
  return `${hours} h ${Math.round(rest / 5) * 5} min`;
}

/** "about 2 h", "about 25 min" — for estimates that should not look precise. */
export const formatApproxDuration = (minutes: number): string =>
  minutes <= 0 ? "—" : `about ${formatDuration(minutes)}`;

export function formatDistance(km: number): string {
  return `${Math.round(km)} km`;
}
