import type { Metadata } from "next";
import "./globals.css";

/**
 * Typography is deliberately webfont-free.
 *
 * The display face is a stack of book serifs that ship with macOS, Windows
 * and most Linux desktops — Iowan Old Style, Palatino, Georgia. They give the
 * editorial voice a travel company should have, and they render on the first
 * paint with no network request, no layout shift, and nothing loaded from a
 * font CDN. On a Georgian phone on mobile data that is worth more than a
 * fashionable variable font.
 *
 * Georgian and Cyrillic fall through to the Noto faces, which are the ones
 * actually installed on devices in the region.
 */

export const metadata: Metadata = {
  title: {
    default: "RouteGeorgia — private drivers and tours across Georgia",
    template: "%s · RouteGeorgia",
  },
  description:
    "Book a verified private driver and vehicle in Georgia at a fixed price. " +
    "Airport transfers, intercity routes and curated day trips.",
  applicationName: "RouteGeorgia",
  authors: [{ name: "RouteGeorgia" }],
  openGraph: { siteName: "RouteGeorgia", locale: "en_GE", type: "website" },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
