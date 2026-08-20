import { NextResponse, type NextRequest } from "next/server";
import { sql } from "@db/client";
import { currentWeather } from "@/lib/weather";
import { rateLimit, clientKey } from "@/lib/security";

/**
 * Weather for one destination, for the Explore map's cards. Public, cached
 * upstream (30 min per coordinate), rate-limited, and never an error: the
 * card simply omits weather when this returns nothing.
 */
export async function GET(request: NextRequest) {
  const limit = rateLimit(await clientKey("weather"), 60, 600);
  if (!limit.allowed) return NextResponse.json({}, { status: 429 });

  const slug = request.nextUrl.searchParams.get("slug") ?? "";
  if (!/^[a-z-]{2,40}$/.test(slug)) return NextResponse.json({}, { status: 400 });

  const [loc] = await sql<{ lat: number; lon: number }[]>`
    SELECT lat, lon FROM locations WHERE slug = ${slug} AND in_service_area`;
  if (!loc) return NextResponse.json({}, { status: 404 });

  const weather = await currentWeather(Number(loc.lat), Number(loc.lon));
  return NextResponse.json(weather ?? {}, {
    headers: { "cache-control": "public, max-age=900" },
  });
}
