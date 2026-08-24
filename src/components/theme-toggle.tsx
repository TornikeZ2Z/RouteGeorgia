"use client";

/**
 * Sun/moon theme switch. Follows the system preference until the visitor
 * chooses; an explicit choice is remembered in localStorage, and choosing
 * the mode that matches the system again returns them to "auto".
 * The two icons are toggled purely by the `dark:` variant, so the button
 * renders correctly before hydration and never mismatches.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  function toggle() {
    const root = document.documentElement;
    const toDark = !root.classList.contains("dark");
    root.classList.toggle("dark", toDark);
    try {
      const system = matchMedia("(prefers-color-scheme: dark)").matches;
      if (toDark === system) localStorage.removeItem("theme");
      else localStorage.theme = toDark ? "dark" : "light";
    } catch {}
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Switch between light and dark mode"
      className={
        "flex size-9 items-center justify-center rounded-full border transition-colors " +
        "border-ink-300 text-ink-600 hover:border-gold-500 hover:text-gold-600 " +
        "dark:border-white/25 dark:text-pine-100 dark:hover:border-gold-400 dark:hover:text-gold-400 " +
        className
      }
    >
      {/* moon — shown in light mode (click to go dark) */}
      <svg viewBox="0 0 24 24" className="size-4 dark:hidden" fill="none" stroke="currentColor"
           strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M20.4 14.2A8.5 8.5 0 0 1 9.8 3.6a8.5 8.5 0 1 0 10.6 10.6Z" />
      </svg>
      {/* sun — shown in dark mode (click to go light) */}
      <svg viewBox="0 0 24 24" className="hidden size-4 dark:block" fill="none" stroke="currentColor"
           strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    </button>
  );
}
