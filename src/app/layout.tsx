import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Route Georgia — private drivers and tours across Georgia",
    template: "%s · Route Georgia",
  },
  description:
    "Book a verified private driver and vehicle in Georgia at a fixed price. " +
    "Airport transfers, intercity routes and curated day trips.",
  applicationName: "Route Georgia",
  authors: [{ name: "Route Georgia" }],
  openGraph: { siteName: "Route Georgia", locale: "en_GE", type: "website" },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
