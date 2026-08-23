import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { Alert, Button, Card, Field, Input } from "@/components/ui";
import { ContourField } from "@/components/contour-field";
import { Logo } from "@/components/logo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in", robots: { index: false } };

export default async function LoginPage({
  searchParams,
}: { searchParams: Promise<{ error?: string; next?: string; reset?: string }> }) {
  const user = await getSessionUser();
  if (user) redirect(user.isStaff ? "/admin" : "/driver");
  const { error, next, reset } = await searchParams;

  return (
    <div className="relative flex min-h-dvh flex-col justify-center overflow-hidden bg-pine-800 px-4 py-12 text-pine-100">
      <ContourField className="text-pine-300" opacity={0.13} seed={5} />
      <div className="relative mx-auto w-full max-w-md">
        <div className="mb-8">
          <Logo dark />
        </div>

      <Card className="p-7">
        <h1 className="font-display text-2xl text-ink-900">Sign in</h1>
        <p className="mt-1 text-sm text-ink-600">Drivers and staff sign in here.</p>

        {reset && (
          <div className="mt-4">
            <Alert tone="success">Your password was changed. Sign in with the new one.</Alert>
          </div>
        )}

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
                : error === "throttled"
                  ? "Too many attempts. Wait a few minutes and try again."
                  : "Something went wrong. Try again."}
            </p>
          )}

          <Button type="submit" className="w-full">Sign in</Button>
        </form>

        <p className="mt-5 text-sm">
          <Link href="/forgot-password" className="text-ink-900 underline underline-offset-2">
            Forgotten your password?
          </Link>
        </p>

        <p className="mt-5 text-xs text-ink-500">
          Drivers: if operations set up your account, use the one-time password they gave you.
          Lost it? Ask them to reset it — we never email passwords.
        </p>
      </Card>
      </div>
    </div>
  );
}
