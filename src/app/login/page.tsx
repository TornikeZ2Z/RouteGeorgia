import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { Button, Card, Field, Input } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in", robots: { index: false } };

export default async function LoginPage({
  searchParams,
}: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const user = await getSessionUser();
  if (user) redirect(user.isStaff ? "/admin" : "/driver");
  const { error, next } = await searchParams;

  return (
    <div className="contours-quiet flex min-h-dvh flex-col justify-center bg-forest-800 px-4 py-12 text-forest-100">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-8 flex items-center gap-3">
          <span aria-hidden className="grid size-10 place-items-center rounded-full bg-wine-600 text-white">
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" aria-hidden>
              <ellipse cx="12" cy="14" rx="9" ry="5.5" strokeWidth="1.3" opacity=".45" />
              <ellipse cx="12" cy="14" rx="5.5" ry="3.2" strokeWidth="1.3" opacity=".7" />
              <path d="M4 18 C9 10, 15 16, 20 7" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </span>
          <span className="font-display text-xl text-white">Route Georgia</span>
        </div>

      <Card className="p-7">
        <h1 className="font-display text-2xl text-ink-900">Sign in</h1>
        <p className="mt-1 text-sm text-ink-600">Drivers and staff sign in here.</p>

        <form action="/api/auth/login" method="post" className="mt-6 space-y-4">
          <input type="hidden" name="next" value={next ?? ""} />
          <Field label="Email" htmlFor="email" required>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </Field>
          <Field label="Password" htmlFor="password" required>
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </Field>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-[--color-danger]" role="alert">
              {error === "invalid"
                ? "Email or password is incorrect."
                : "Something went wrong. Try again."}
            </p>
          )}

          <Button type="submit" className="w-full">Sign in</Button>
        </form>

        <p className="mt-6 text-xs text-ink-500">
          Drivers: if operations set up your account, use the one-time password they gave you.
          Lost it? Ask them to reset it — we never email passwords.
        </p>
      </Card>
      </div>
    </div>
  );
}
