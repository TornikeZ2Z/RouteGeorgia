import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Gamgzavri — private drivers in Georgia", template: "%s · Gamgzavri" },
  description: "Book a verified private driver and vehicle in Georgia at a fixed price.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
