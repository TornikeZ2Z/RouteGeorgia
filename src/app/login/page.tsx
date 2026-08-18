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
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4">
      <Card className="p-6">
        <h1 className="text-xl font-semibold text-ink-900">Sign in</h1>
        <p className="mt-1 text-sm text-ink-500">Drivers and staff sign in here.</p>

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
          Seeded accounts are listed in README.md. Change every password before deploying.
        </p>
      </Card>
    </div>
  );
}
