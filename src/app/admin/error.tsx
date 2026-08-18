"use client";

import Link from "next/link";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="rounded-xl border border-ink-200 bg-white px-6 py-12 text-center">
      <h1 className="font-semibold text-ink-900">You cannot open this page</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-600">
        Your role does not include the permission this page requires, or the page failed to load.
        Permissions are checked on the server, so this is enforced regardless of what the menu shows.
      </p>
      {error.digest && <p className="mt-3 font-mono text-xs text-ink-400">Reference: {error.digest}</p>}
      <div className="mt-6 flex justify-center gap-3">
        <button onClick={reset} className="rounded-lg border border-ink-200 px-4 py-2 text-sm hover:bg-ink-50">
          Try again
        </button>
        <Link href="/admin" className="rounded-lg bg-brand-600 px-4 py-2 text-sm text-white">Command centre</Link>
      </div>
    </div>
  );
}
