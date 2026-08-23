import Link from "next/link";
import { Logo } from "@/components/logo";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-20 text-center">
      <Logo />
      <p className="eyebrow mt-10">404</p>
      <h1 className="font-display mt-2 text-3xl text-ink-900">Page not found</h1>
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-ink-500">
        That page does not exist, or the driver profile is not published.
      </p>
      <Link
        href="/"
        className="mt-8 inline-flex min-h-11 items-center rounded-xl bg-brand-600 px-6 py-2.5 text-sm text-white shadow-[0_0_2px_0_rgba(0,0,0,.16)] transition-colors hover:bg-brand-700"
      >
        Go home
      </Link>
    </div>
  );
}
