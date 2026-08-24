"use client";

import Link from "next/link";

/**
 * A client error boundary has no session, so it cannot know the driver's
 * language. Georgian first — every driver here reads it — with English
 * beneath for the rest.
 */
export default function DriverError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="rounded-xl border border-ink-200 bg-white px-6 py-12 text-center">
      <h1 className="font-semibold text-ink-900">ამ გვერდის გახსნა ვერ ხერხდება</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-600">
        ან თქვენი პროფილი ამისთვის ჯერ არ არის მზად, ან გვერდი ვერ ჩაიტვირთა. არაფერი შეცვლილა.
      </p>
      <p className="mx-auto mt-1 max-w-md text-xs text-ink-400">
        Either your profile is not set up for this yet, or the page failed to load. Nothing was changed.
      </p>
      {error.digest && <p className="mt-3 font-mono text-xs text-ink-400">Ref: {error.digest}</p>}
      <div className="mt-6 flex justify-center gap-3">
        <button onClick={reset} className="rounded-lg border border-ink-200 px-4 py-2 text-sm hover:bg-ink-50">
          თავიდან ცდა
        </button>
        <Link href="/driver" className="rounded-lg bg-brand-600 px-4 py-2 text-sm text-white">მთავარი</Link>
      </div>
    </div>
  );
}
