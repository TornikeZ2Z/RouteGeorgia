import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center">
      <h1 className="text-xl font-semibold text-ink-900">Page not found</h1>
      <p className="mt-2 text-sm text-ink-600">
        That page does not exist, or the driver profile is not published.
      </p>
      <Link href="/" className="mt-6 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm text-white hover:bg-brand-700">
        Go home
      </Link>
    </div>
  );
}
