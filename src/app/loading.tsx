export default function Loading() {
  return (
    <div className="mx-auto max-w-[1400px] 2xl:max-w-[1680px] px-4 py-12" role="status" aria-live="polite">
      <span className="sr-only">Loading</span>
      <div className="space-y-3">
        <div className="h-6 w-48 animate-pulse rounded bg-ink-200" />
        <div className="h-24 animate-pulse rounded-xl bg-ink-100" />
        <div className="h-24 animate-pulse rounded-xl bg-ink-100" />
      </div>
    </div>
  );
}
