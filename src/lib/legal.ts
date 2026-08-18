import type { Locale } from "@/lib/i18n";

/**
 * Terms, privacy and cancellation copy.
 *
 * These are written to describe what this software actually does — what data
 * it stores, for how long, who can see it, and what the cancellation rules
 * are — rather than being a template with the company name substituted in.
 * That makes them accurate today and a much better starting point for the
 * Georgian lawyer who must review them before real trading.
 *
 * They are NOT a substitute for that review. `reviewed` says so on the page.
 */
export interface LegalDocument {
  slug: string;
  title: string;
  updated: string;
  intro: string;
  sections: { heading: string; body: string[] }[];
}

const COMPANY = "Route Georgia";
const CONTACT = "support@routegeorgia.ge";

export const LEGAL_SLUGS = ["terms", "privacy", "cancellation"] as const;
export type LegalSlug = (typeof LEGAL_SLUGS)[number];

export function getLegalDocument(slug: string, _locale: Locale): LegalDocument | null {
  switch (slug) {
    case "terms":
      return {
        slug: "terms",
        title: "Terms of service",
        updated: "18 August 2026",
        intro:
          `${COMPANY} is a marketplace. We introduce travellers to independent private drivers ` +
          `in Georgia, take the booking, and support both sides. We are not the carrier: the ` +
          `driver performs the journey and is responsible for doing so safely and lawfully.`,
        sections: [
          {
            heading: "What we do and do not do",
            body: [
              `We verify each driver's identity, licence, vehicle registration and insurance before ` +
              `their profile is published, and we re-check that those documents are still valid on ` +
              `your travel date. We take the booking, hold the agreed price, and provide support.`,
              `We do not employ drivers and we do not own the vehicles. Drivers are independent ` +
              `operators who set their own rates within limits we publish.`,
            ],
          },
          {
            heading: "Prices",
            body: [
              `The price shown is for the whole vehicle, not per person, and it is fixed at the ` +
              `moment you book. It does not change afterwards unless you ask for a change to the ` +
              `trip and accept a revised quote.`,
              `Every price is set and charged in Georgian lari. Other currencies shown on the site ` +
              `are converted from a dated exchange rate for guidance only.`,
              `Driving times exclude stops, traffic, border formalities and weather. They are an ` +
              `estimate of moving time, not a guarantee of arrival.`,
            ],
          },
          {
            heading: "Payment",
            body: [
              `You may pay the driver in cash at the end of the trip, or by card online where card ` +
              `payment is available. We never see or store your card number; card payments are ` +
              `handled by a licensed payment provider.`,
              `We charge drivers a commission on completed bookings. That commission is included ` +
              `in the price you see — there is no separate booking fee.`,
            ],
          },
          {
            heading: "Cancellation",
            body: [
              `You may cancel free of charge. We ask for at least 24 hours' notice where possible, ` +
              `so the driver can find other work.`,
              `If a driver cancels, we will find you an equivalent or better replacement at the ` +
              `same price, or refund you in full.`,
              `If you do not appear at the agreed meeting point, the driver will wait and contact ` +
              `you. See the cancellation policy for the current grace period.`,
            ],
          },
          {
            heading: "Your conduct",
            body: [
              `Arrangements for a booking should stay on the platform, so that our support team can ` +
              `help if something changes. Taking a booking off-platform removes that protection ` +
              `from you and breaches the driver's agreement with us.`,
              `We may suspend an account that abuses drivers or staff, makes fraudulent bookings, ` +
              `or repeatedly fails to appear.`,
            ],
          },
          {
            heading: "Liability",
            body: [
              `Nothing here limits liability that cannot lawfully be limited, including for death ` +
              `or personal injury caused by negligence.`,
              `The driver is responsible for the journey. Our responsibility is for the service we ` +
              `provide: verification, the booking, the agreed price and support.`,
            ],
          },
          {
            heading: "Contact",
            body: [`Write to ${CONTACT} and a person will answer.`],
          },
        ],
      };

    case "privacy":
      return {
        slug: "privacy",
        title: "Privacy notice",
        updated: "18 August 2026",
        intro:
          `This describes exactly what ${COMPANY} stores, why, who can see it and how long we ` +
          `keep it. It is written from the actual database rather than from a template, so if ` +
          `something is listed here the system really does hold it.`,
        sections: [
          {
            heading: "What we collect from travellers",
            body: [
              `To take a booking: your name, email address, phone number, the exact pickup and ` +
              `drop-off addresses, your flight number if you give one, how many passengers and ` +
              `bags, whether you need child seats, and any notes you write for the driver.`,
              `To run the service: the searches you make, the quotes you were shown, your booking ` +
              `history, messages you exchange with the driver, and reviews you leave.`,
              `We do not track your location. Trip milestones are timestamps recorded by the ` +
              `driver, not a live position.`,
            ],
          },
          {
            heading: "What we collect from drivers",
            body: [
              `Identity document, driving licence, vehicle registration and insurance, held in ` +
              `restricted storage separate from public photographs. Document numbers are stored ` +
              `only as one-way hashes, never in readable form.`,
              `Every time a member of staff opens one of these documents it is recorded in an ` +
              `audit log that cannot be altered or deleted.`,
            ],
          },
          {
            heading: "Who can see it",
            body: [
              `Your driver sees what they need to carry out the trip: your name, phone number, ` +
              `meeting details and any requirements. They do not see your other bookings.`,
              `Our staff see what their role allows and no more. A support agent can read a ` +
              `booking to help you but cannot approve drivers or move money; only finance staff ` +
              `can issue a refund. Every significant action is recorded with who did it and why.`,
            ],
          },
          {
            heading: "How long we keep it",
            body: [
              `Searches and quotes that never became a booking: 30 to 90 days.`,
              `Bookings and financial records: as long as Georgian accounting and tax law requires, ` +
              `plus the period in which a dispute could still be raised.`,
              `Driver documents: while the driver is active, plus any lawful claims period.`,
              `Messages and support conversations: the service and claims period.`,
            ],
          },
          {
            heading: "Your rights",
            body: [
              `You can ask for a copy of what we hold about you, ask us to correct it, or ask us ` +
              `to delete it. Write to ${CONTACT}. We will verify who you are before acting, and ` +
              `we may keep records the law requires us to keep.`,
              `Georgia's Law on Personal Data Protection applies to us. If you are in the EU or ` +
              `UK, GDPR rights may also apply to you.`,
            ],
          },
          {
            heading: "Cookies",
            body: [
              `We set a small number of cookies that the site cannot work without: your sign-in ` +
              `session, and your chosen language and display currency. These carry no advertising ` +
              `identifier and are not shared.`,
              `We do not use advertising or tracking cookies. If that ever changes we will ask ` +
              `first.`,
            ],
          },
        ],
      };

    case "cancellation":
      return {
        slug: "cancellation",
        title: "Cancellation policy",
        updated: "18 August 2026",
        intro:
          `Cancellation is currently free of charge. This page records the policy in force so ` +
          `that a booking made today is judged by the rules that applied today, even if the ` +
          `policy changes later.`,
        sections: [
          {
            heading: "If you cancel",
            body: [
              `Free of charge, at any notice period. We ask for at least 24 hours where possible ` +
              `so your driver can find other work — a driver who holds a day for a trip that ` +
              `evaporates has lost that day.`,
              `A card payment is returned to the card you paid with. Banks usually take five to ` +
              `ten working days.`,
            ],
          },
          {
            heading: "If your driver cancels",
            body: [
              `We find you an equivalent or better replacement at the price you already agreed. ` +
              `If the replacement charges more, we absorb the difference.`,
              `If we cannot find one, you are refunded in full and pay nothing.`,
            ],
          },
          {
            heading: "If you do not appear",
            body: [
              `Your driver waits at the agreed point and contacts you. The current grace period ` +
              `is 30 minutes, longer for airport pickups where we track your flight.`,
              `We record no-shows but do not currently charge for them. If that changes we will ` +
              `say so here before it applies to any new booking.`,
            ],
          },
          {
            heading: "Weather and road closures",
            body: [
              `Mountain routes close. If a road is closed or conditions are genuinely unsafe we ` +
              `will move your trip or refund it in full. We would rather lose the booking than ` +
              `send you over a pass in the wrong conditions.`,
            ],
          },
        ],
      };

    default:
      return null;
  }
}
