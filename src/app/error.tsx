"use client";

import Link from "next/link";

/**
 * Top-level error boundary. A denied permission reaches here as a thrown
 * ForbiddenError; the message is redacted in production, so the copy has to be
 * useful without revealing which check failed.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center">
      <h1 className="text-xl font-semibold text-ink-900">This did not work</h1>
      <p className="mt-2 text-sm text-ink-600">
        Either you do not have permission for this page, or something failed on our side.
        Nothing was changed.
      </p>
      {error.digest && (
        <p className="mt-3 font-mono text-xs text-ink-400">Reference: {error.digest}</p>
      )}
      <div className="mt-6 flex justify-center gap-3">
        <button onClick={reset} className="rounded-lg border border-ink-200 bg-white px-4 py-2 text-sm hover:bg-ink-50">
          Try again
        </button>
        <Link href="/" className="rounded-lg bg-wine-600 px-4 py-2 text-sm text-white hover:bg-wine-700">
          Go home
        </Link>
      </div>
    </div>
  );
}
