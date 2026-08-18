import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isLocale, LOCALES } from "@/lib/i18n";
import { config } from "@/lib/config";
import { Card } from "@/components/ui";

export const revalidate = 3600;

interface Props { params: Promise<{ locale: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: "Contact and support",
    description: "How to reach Route Georgia before, during or after a trip.",
    alternates: {
      canonical: `${config.appUrl}/${locale}/contact`,
      languages: Object.fromEntries(LOCALES.map((l) => [l, `${config.appUrl}/${l}/contact`])),
    },
  };
}

/**
 * Contact details are held in one place so they cannot drift between the
 * footer, the emails and this page. Replace these with real ones before
 * launch — a support address nobody reads is worse than none.
 */
const SUPPORT_EMAIL = "support@routegeorgia.ge";
const SUPPORT_HOURS = "Every day, 08:00 – 22:00 Georgia time";

export default async function Contact({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <header>
        <p className="eyebrow text-wine-600">Support</p>
        <h1 className="font-display mt-3 text-4xl text-ink-900 sm:text-5xl">Talk to a person</h1>
        <p className="mt-5 text-lg leading-relaxed text-ink-700">
          If something about a trip is not right, tell us. A booking that is going wrong is worth a
          phone call, not a form.
        </p>
      </header>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <Card className="p-6">
          <h2 className="font-display text-xl text-ink-900">Already booked?</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-600">
            Use the link in your confirmation email. It opens your booking, where you can message
            your driver directly, change the meeting details, or cancel.
          </p>
          <p className="mt-3 text-sm text-ink-600">
            Messages there are seen by our support team as well as the driver, so nothing is lost if
            plans change.
          </p>
        </Card>

        <Card className="p-6">
          <h2 className="font-display text-xl text-ink-900">Everything else</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-600">
            Email <a href={`mailto:${SUPPORT_EMAIL}`} className="text-wine-700 underline">{SUPPORT_EMAIL}</a>{" "}
            and a person will answer.
          </p>
          <p className="mt-3 text-sm text-ink-600">{SUPPORT_HOURS}</p>
        </Card>

        <Card className="p-6">
          <h2 className="font-display text-xl text-ink-900">Drivers</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-600">
            To join, start at{" "}
            <Link href="/driver" className="text-wine-700 underline">drive with us</Link>. You will
            need your licence, vehicle registration and an insurance policy that covers carrying
            paying passengers.
          </p>
          <p className="mt-3 text-sm text-ink-600">
            Already driving with us? Sign in and use the support link on the booking.
          </p>
        </Card>

        <Card className="p-6">
          <h2 className="font-display text-xl text-ink-900">In an emergency</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-600">
            If anyone is in danger, call the Georgian emergency number <strong>112</strong> first.
            Tell us afterwards and we will deal with the booking.
          </p>
        </Card>
      </div>

      <section className="mt-12">
        <h2 className="font-display text-2xl text-ink-900">The rules, plainly</h2>
        <div className="rule-fade mt-3" />
        <ul className="mt-4 space-y-2 text-sm">
          {[
            ["terms", "Terms of service — what we do, what the driver does"],
            ["privacy", "Privacy notice — exactly what we store and for how long"],
            ["cancellation", "Cancellation policy — currently free of charge"],
          ].map(([slug, label]) => (
            <li key={slug}>
              <Link href={`/${locale}/legal/${slug}`} className="text-wine-700 underline underline-offset-4">
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
