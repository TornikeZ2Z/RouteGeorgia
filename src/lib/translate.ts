import "server-only";
/**
 * Machine translation for the driver–traveller chat.
 *
 * Our drivers are Georgian and our travellers are not. A thread neither side
 * can read is only half a channel, so each message can be shown translated
 * into the reader's own language.
 *
 * The default provider is MyMemory: free, no key, no billing account, which
 * keeps this working from day one — the same trade made for road distances
 * with OSRM. It is rate-limited and occasionally wrong, and both are
 * acceptable for "roughly what did they say"; neither is acceptable for the
 * contract or the fare, which is why nothing else in the system is translated
 * by machine.
 *
 * Every failure degrades to the original text rather than an error: a driver
 * seeing Russian they cannot read is bad, a driver seeing a broken page is
 * worse. Results are cached per (message, language) so the same thread opened
 * ten times costs one call.
 */
import { sql } from "@db/client";
import { LOCALES, type Locale } from "@/lib/i18n";

const TIMEOUT_MS = 4000;
const MAX_CHARS = 500;

export interface Translation {
  body: string;
  provider: string;
  /** False when the text came back unchanged — nothing to show the reader. */
  translated: boolean;
}

/**
 * Georgian is written in Mkhedruli and nothing else here is, so script is a
 * reliable enough signal to skip a pointless call. Cyrillic means Russian;
 * anything else is treated as English, which is what our travellers write.
 */
export function guessLocale(text: string): Locale {
  if (/[Ⴀ-ჿ]/.test(text)) return "ka";
  if (/[Ѐ-ӿ]/.test(text)) return "ru";
  return "en";
}

/**
 * Georgian has no capital letters. Engines trained on Latin-script data
 * "capitalise" the first word into Mtavruli — a display style used for
 * headings and, in running text, read as shouting. Mtavruli sits at U+1C90
 * and maps one-to-one onto Mkhedruli at U+10D0, so it converts back exactly.
 */
function demtavruli(text: string): string {
  return text.replace(/[Ა-Ჺ]/g, (ch) =>
    String.fromCodePoint(ch.codePointAt(0)! - 0x0bc0));
}

async function callMyMemory(text: string, from: Locale, to: Locale): Promise<string | null> {
  const url = new URL("https://api.mymemory.translated.net/get");
  url.searchParams.set("q", text.slice(0, MAX_CHARS));
  url.searchParams.set("langpair", `${from}|${to}`);
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "User-Agent": "RoutePlanner/1.0 (routeplanner.ge)" },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      responseStatus?: number | string;
      responseData?: { translatedText?: string };
    };
    if (Number(data.responseStatus) !== 200) return null;
    const out = data.responseData?.translatedText?.trim();
    if (!out) return null;
    // The free tier answers quota problems inside a 200 with the complaint as
    // the "translation". Refuse anything that looks like their error prose.
    if (/MYMEMORY WARNING|QUERY LENGTH LIMIT|INVALID LANGUAGE/i.test(out)) return null;
    return to === "ka" ? demtavruli(out) : out;
  } catch {
    return null;
  }
}

/**
 * Translate one stored message into `target`, using the cache when possible.
 * Returns the original text with `translated: false` whenever translation is
 * unnecessary, unavailable, or indistinguishable from the source.
 */
export async function translateMessage(
  messageId: string,
  body: string,
  target: Locale,
): Promise<Translation> {
  if (!LOCALES.includes(target)) return { body, provider: "none", translated: false };

  const source = guessLocale(body);
  if (source === target) return { body, provider: "none", translated: false };

  const [cached] = await sql<{ body: string; provider: string }[]>`
    SELECT body, provider FROM message_translations
    WHERE message_id = ${messageId}::uuid AND target_locale = ${target}`;
  if (cached) return { body: cached.body, provider: cached.provider, translated: true };

  const out = await callMyMemory(body, source, target);
  if (!out || out.trim() === body.trim()) return { body, provider: "none", translated: false };

  // A racing request may have cached the same pair first; either answer is
  // equally valid, so keep whichever landed.
  await sql`
    INSERT INTO message_translations (message_id, target_locale, body, provider)
    VALUES (${messageId}::uuid, ${target}, ${out}, 'mymemory')
    ON CONFLICT (message_id, target_locale) DO NOTHING`;

  return { body: out, provider: "mymemory", translated: true };
}

/** Translate a whole thread in parallel, preserving order. */
export async function translateThread(
  messages: { id: string; body: string }[],
  target: Locale,
): Promise<Map<string, Translation>> {
  const results = await Promise.all(
    messages.map(async (m) => [m.id, await translateMessage(m.id, m.body, target)] as const),
  );
  return new Map(results);
}
