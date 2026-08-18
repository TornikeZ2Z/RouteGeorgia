import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { sql } from "@db/client";
import { isLocale, LOCALES, DEFAULT_LOCALE } from "@/lib/i18n";
import { config } from "@/lib/config";
import { Card } from "@/components/ui";

export const revalidate = 3600;

interface Props { params: Promise<{ locale: string }> }

/** Editorial answers to the questions that otherwise become support tickets. */
const FALLBACK: { q: string; a: string }[] = [
  {
    q: "Is the price per person or per vehicle?",
    a: "Per vehicle. Four people travelling together pay the price shown once, not four times.",
  },
  {
    q: "Why is the price different for a short trip and a long one?",
    a: "On long or remote routes your driver usually has to return empty, and part of that return distance is included in the price. On city and airport transfers they can pick up another passenger nearby, so almost none of it is. We show this as a separate line in every price breakdown.",
  },
  {
    q: "Does the driving time include stops?",
    a: "No. The time shown is moving time only. Stops for photographs, food or sightseeing are not time-limited and are not charged extra, but they do make the day longer — plan accordingly, especially for airport departures.",
  },
  {
    q: "Can I add stops along the way?",
    a: "Yes. Add them when you search and the price updates to include them. Tell your driver about any additional stop before the trip rather than on the road.",
  },
  {
    q: "How do I know the driver actually speaks my language?",
    a: "Each language shows whether it is self-declared or verified by us in an interview. You can filter search results to interview-verified drivers only.",
  },
  {
    q: "What happens if my flight is delayed?",
    a: "Give us your flight number when you book. We track the arrival and move the pickup without changing the agreed price.",
  },
  {
    q: "Can I cancel?",
    a: "Yes, free of charge. We ask for at least 24 hours' notice where possible so the driver can find other work.",
  },
  {
    q: "How do I pay?",
    a: "Payment is being built. When it launches you will be able to pay the driver in cash at the end of the trip, or by card online. All prices are set and charged in Georgian lari.",
  },
  {
    q: "Are the drivers checked?",
    a: "Every driver's identity, licence, vehicle registration and insurance is reviewed before their profile goes live, and each document must still be valid on your travel date or they cannot be offered to you.",
  },
];

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const url = `${config.appUrl}/${locale}/faq`;
  return {
    title: "Frequently asked questions",
    description: "How pricing, stops, cancellation, languages and driver checks work.",
    alternates: {
      canonical: url,
      languages: Object.fromEntries(LOCALES.map((l) => [l, `${config.appUrl}/${l}/faq`])),
    },
  };
}

export default async function FaqPage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  // CMS content overrides the built-in copy when an editor has published it.
  const rows = await sql<{ title: string; body: string }[]>`
    SELECT title, body FROM content_pages
    WHERE slug = 'faq' AND published AND locale IN (${locale}, ${DEFAULT_LOCALE})
    ORDER BY CASE WHEN locale = ${locale} THEN 0 ELSE 1 END
    LIMIT 1`;
  const cms = rows[0];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FALLBACK.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <div className="space-y-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
          {cms?.title ?? "Frequently asked questions"}
        </h1>
        {cms?.body && <p className="mt-2 max-w-2xl text-ink-600">{cms.body}</p>}
      </header>

      <ul className="space-y-3">
        {FALLBACK.map((f) => (
          <li key={f.q}>
            <Card className="p-4">
              <details>
                <summary className="cursor-pointer font-medium text-ink-900">{f.q}</summary>
                <p className="mt-2 text-sm leading-relaxed text-ink-600">{f.a}</p>
              </details>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
