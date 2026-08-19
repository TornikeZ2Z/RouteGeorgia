import "server-only";

/**
 * Current weather for a destination, from Open-Meteo (no key, free tier).
 *
 * Strictly decorative: any failure — network, quota, sandbox egress rules —
 * returns null and the caller renders nothing. A weather chip must never be
 * the reason a route page errors. Cached in-process for 30 minutes per
 * coordinate pair.
 */
interface Weather { temperatureC: number; bucket: "clear" | "clouds" | "rain" | "snow" | "fog" | "storm" }

const cache = new Map<string, { at: number; value: Weather | null }>();
const TTL_MS = 30 * 60_000;

function bucketFor(code: number): Weather["bucket"] {
  if (code === 0 || code === 1) return "clear";
  if (code === 45 || code === 48) return "fog";
  if (code >= 95) return "storm";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 51) return "rain";
  return "clouds";
}

export async function currentWeather(lat: number, lon: number): Promise<Weather | null> {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  let value: Weather | null = null;
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code`,
      { signal: AbortSignal.timeout(2500), next: { revalidate: 1800 } },
    );
    if (res.ok) {
      const data = (await res.json()) as { current?: { temperature_2m?: number; weather_code?: number } };
      if (typeof data.current?.temperature_2m === "number") {
        value = { temperatureC: Math.round(data.current.temperature_2m), bucket: bucketFor(data.current.weather_code ?? 3) };
      }
    }
  } catch {
    value = null;
  }
  cache.set(key, { at: Date.now(), value });
  return value;
}
