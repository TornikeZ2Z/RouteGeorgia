import Link from "next/link";
import { Alert, Button, Card, Field, Input } from "@/components/ui";
import { ContourField } from "@/components/contour-field";

export const dynamic = "force-dynamic";
export const metadata = { title: "Choose a new password", robots: { index: false } };

export default async function ResetPassword({
  searchParams,
}: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token, error } = await searchParams;

  return (
    <div className="relative flex min-h-dvh flex-col justify-center overflow-hidden bg-pine-800 px-4 py-12">
      <ContourField className="text-pine-300" opacity={0.13} seed={11} />
      <div className="relative mx-auto w-full max-w-md">
        <Card className="p-7">
          <h1 className="font-display text-2xl text-ink-900">Choose a new password</h1>

          {!token ? (
            <div className="mt-4 space-y-4">
              <Alert tone="danger">
                This link is incomplete. Open the link from your email exactly as it was sent.
              </Alert>
              <Link href="/forgot-password" className="inline-block text-sm text-brand-700 underline">
                Request a new link
              </Link>
            </div>
          ) : (
            <form action="/api/auth/reset" method="post" className="mt-6 space-y-4">
              <input type="hidden" name="token" value={token} />

              <Field
                label="New password" htmlFor="password"
                hint="At least 12 characters. Length matters more than symbols." required
              >
                <Input id="password" name="password" type="password" minLength={12}
                       autoComplete="new-password" required autoFocus />
              </Field>

              <Field label="Type it again" htmlFor="confirm" required>
                <Input id="confirm" name="confirm" type="password" minLength={12}
                       autoComplete="new-password" required />
              </Field>

              {error && (
                <Alert tone="danger">
                  {error === "mismatch"
                    ? "The two passwords do not match."
                    : error === "throttled"
                      ? "Too many attempts. Wait a few minutes."
                      : error}
                </Alert>
              )}

              <Alert tone="info">
                Changing your password signs you out everywhere else.
              </Alert>

              <Button type="submit" className="w-full">Change password</Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
