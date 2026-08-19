import type { ComponentProps, ReactNode } from "react";

/** Small, dependency-free design system. Every element is keyboard reachable. */

const cx = (...parts: (string | false | undefined | null)[]) => parts.filter(Boolean).join(" ");

export function Button({
  variant = "primary", size = "md", className, ...props
}: ComponentProps<"button"> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
}) {
  // Minimum 44px tall at md and above: the driver app is used one-handed on a
  // phone, often in a moving vehicle.
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg font-normal " +
    "transition-[background-color,box-shadow,transform] duration-150 " +
    "active:translate-y-px disabled:opacity-50 disabled:cursor-not-allowed disabled:active:translate-y-0";
  const sizes = {
    sm: "px-3 py-1.5 text-sm",
    md: "px-4 py-2.5 text-sm min-h-11",
    lg: "px-6 py-3 text-base min-h-12",
  };
  const variants = {
    primary: "bg-brand-600 text-white shadow-[0_0_2px_0_rgba(0,0,0,.16)] hover:bg-brand-700",
    secondary: "bg-white text-ink-900 border border-ink-300 hover:border-ink-500",
    ghost: "text-ink-600 hover:bg-ink-100",
    danger: "bg-[--color-danger] text-white shadow-sm hover:opacity-90",
  };
  return <button className={cx(base, sizes[size], variants[variant], className)} {...props} />;
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cx("rounded-lg border border-ink-300 bg-white", className)}>
      {children}
    </div>
  );
}

export function Field({
  label, hint, error, required, children, htmlFor,
}: {
  label: string; hint?: string; error?: string; required?: boolean;
  children: ReactNode; htmlFor?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink-800">
        {label}
        {required && <span className="text-[--color-danger]" aria-hidden> *</span>}
        {required && <span className="sr-only"> (required)</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-ink-500">{hint}</p>}
      {error && <p className="text-xs text-[--color-danger]" role="alert">{error}</p>}
    </div>
  );
}

const FIELD_BASE =
  "w-full rounded-lg border border-ink-300 bg-white px-3 py-2.5 text-sm text-ink-900 " +
  "transition-colors placeholder:text-ink-400 hover:border-ink-400 " +
  "focus:border-ink-900 focus:ring-0 disabled:bg-ink-50 disabled:text-ink-500";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cx(FIELD_BASE, className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return <select className={cx(FIELD_BASE, "pr-8", className)} {...props}>{children}</select>;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cx(FIELD_BASE, "resize-y leading-relaxed", className)} {...props} />;
}

/**
 * Semantic tones. Note that danger is NOT the wine brand colour: a warm red
 * primary button and a red error message must not look like the same thing.
 */
const TONES = {
  neutral: "bg-ink-100 text-ink-700",
  success: "bg-pine-100 text-pine-700",
  warning: "bg-gold-100 text-gold-700",
  danger: "bg-[--color-danger-bg] text-[--color-danger]",
  info: "bg-steel-100 text-steel-700",
} as const;

export function Badge({ tone = "neutral", children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return (
    <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", TONES[tone])}>
      {children}
    </span>
  );
}

export function Alert({ tone = "info", title, children }: { tone?: keyof typeof TONES; title?: string; children: ReactNode }) {
  return (
    <div className={cx("rounded-lg px-4 py-3.5 text-sm leading-relaxed", TONES[tone])} role="status">
      {title && <p className="font-semibold">{title}</p>}
      <div className={title ? "mt-1" : undefined}>{children}</div>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-ink-300 bg-white/60 px-6 py-14 text-center">
      <p className="text-base font-medium text-ink-800">{title}</p>
      {children && (
        <div className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-500">{children}</div>
      )}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-ink-200 pb-5">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-600">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-ink-200 bg-white">
      <table className="w-full text-sm">
        <thead className="border-b border-ink-200 bg-ink-50/70 text-left">
          <tr>
            {head.map((h, i) => (
              <th key={i} scope="col"
                  className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-500">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100 [&_tr:hover]:bg-ink-50/50">{children}</tbody>
      </table>
    </div>
  );
}
