import type { ComponentProps, ReactNode } from "react";

/** Small, dependency-free design system. Every element is keyboard reachable. */

const cx = (...parts: (string | false | undefined | null)[]) => parts.filter(Boolean).join(" ");

export function Button({
  variant = "primary", size = "md", className, ...props
}: ComponentProps<"button"> & { variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md" }) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const sizes = { sm: "px-3 py-1.5 text-sm", md: "px-4 py-2.5 text-sm" };
  const variants = {
    primary: "bg-wine-600 text-white hover:bg-wine-700",
    secondary: "bg-white text-ink-800 border border-ink-300 hover:bg-ink-50",
    ghost: "text-ink-600 hover:bg-ink-100",
    danger: "bg-[--color-danger] text-white hover:opacity-90",
  };
  return <button className={cx(base, sizes[size], variants[variant], className)} {...props} />;
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cx("rounded-xl border border-ink-200 bg-white shadow-sm", className)}>
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

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cx(
        "w-full rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm",
        "placeholder:text-ink-400 focus:border-wine-500 focus:ring-0",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cx("w-full rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm", className)}
      {...props}
    >
      {children}
    </select>
  );
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cx("w-full rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm", className)}
      {...props}
    />
  );
}

/**
 * Semantic tones. Note that danger is NOT the wine brand colour: a warm red
 * primary button and a red error message must not look like the same thing.
 */
const TONES = {
  neutral: "bg-ink-100 text-ink-700",
  success: "bg-forest-100 text-forest-700",
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
    <div className={cx("rounded-lg px-4 py-3 text-sm", TONES[tone])} role="status">
      {title && <p className="font-semibold">{title}</p>}
      <div>{children}</div>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-ink-300 bg-white px-6 py-12 text-center">
      <p className="font-medium text-ink-800">{title}</p>
      {children && <div className="mt-1 text-sm text-ink-500">{children}</div>}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-500">{description}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-ink-200 bg-white">
      <table className="w-full text-sm">
        <thead className="border-b border-ink-200 bg-ink-50 text-left">
          <tr>
            {head.map((h, i) => (
              <th key={i} scope="col" className="px-4 py-2.5 font-medium text-ink-600">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">{children}</tbody>
      </table>
    </div>
  );
}
