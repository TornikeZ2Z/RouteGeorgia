import { Card } from "@/components/ui";

/**
 * Order search, as a plain GET form.
 *
 * Collapsed on a phone behind one control, for the same reason the traveller's
 * search filters are: the driver came here to see their jobs, not to configure
 * a query. A peer checkbox rather than JavaScript keeps it working with
 * scripting blocked and keeps the panel in the DOM exactly once.
 */
export function OrderFilters({
  q, from, to, labels,
}: {
  q: string; from: string; to: string;
  labels: {
    search: string; searchHint: string; from: string; to: string;
    apply: string; clear: string; count: string;
  };
}) {
  const active = Boolean(q || from || to);

  return (
    <>
      <input type="checkbox" id="order-filters-open" className="peer sr-only lg:hidden" />
      <div className="flex items-center justify-between gap-3 lg:hidden">
        <p className="text-sm text-ink-500">{labels.count}</p>
        <label
          htmlFor="order-filters-open"
          className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-medium text-ink-800 hover:bg-ink-50"
        >
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor"
               strokeWidth="1.8" strokeLinecap="round" aria-hidden>
            <path d="m21 21-4.3-4.3M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z" />
          </svg>
          {labels.search}
          {active && <span className="size-2 rounded-full bg-brand-600" aria-hidden />}
        </label>
      </div>

      <Card className="mt-3 hidden p-4 peer-checked:block lg:mt-0 lg:block">
        <form method="get" className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
          <div>
            <label htmlFor="q" className="mb-1 block text-xs font-medium text-ink-500">
              {labels.search}
            </label>
            <input
              id="q" name="q" defaultValue={q} maxLength={80}
              placeholder={labels.searchHint}
              className="min-h-11 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-ink-900 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="from" className="mb-1 block text-xs font-medium text-ink-500">
              {labels.from}
            </label>
            <input
              id="from" name="from" type="date" defaultValue={from}
              className="min-h-11 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm text-ink-900 focus:border-ink-900 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="to" className="mb-1 block text-xs font-medium text-ink-500">
              {labels.to}
            </label>
            <input
              id="to" name="to" type="date" defaultValue={to}
              className="min-h-11 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm text-ink-900 focus:border-ink-900 focus:outline-none"
            />
          </div>
          <div className="flex gap-2">
            <button className="min-h-11 rounded-lg bg-pine-800 px-4 text-sm font-semibold text-white hover:bg-pine-700">
              {labels.apply}
            </button>
            {active && (
              <a
                href="/driver/orders"
                className="inline-flex min-h-11 items-center rounded-lg border border-ink-200 px-4 text-sm text-ink-600 hover:bg-ink-50"
              >
                {labels.clear}
              </a>
            )}
          </div>
        </form>
        <p className="mt-2 hidden text-xs text-ink-500 lg:block">{labels.count}</p>
      </Card>
    </>
  );
}
