import Link from "next/link";
import { Alert, Button, Card, Field, Input } from "@/components/ui";
import { ContourField } from "@/components/contour-field";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reset your password", robots: { index: false } };

export default async function ForgotPassword({
  searchParams,
}: { searchParams: Promise<{ sent?: string }> }) {
  const { sent } = await searchParams;

  return (
    <div className="relative flex min-h-dvh flex-col justify-center overflow-hidden bg-pine-800 px-4 py-12">
      <ContourField className="text-pine-300" opacity={0.13} seed={7} />
      <div className="relative mx-auto w-full max-w-md">
        <Card className="p-7">
          <h1 className="font-display text-2xl text-ink-900">Reset your password</h1>

          {sent ? (
            <div className="mt-4 space-y-4">
              <Alert tone="success" title="Check your email">
                If that address has an account, a reset link is on its way. It works once and
                expires in an hour.
              </Alert>
              <p className="text-sm text-ink-600">
                Nothing arrived? Check spam, then try again — or ask operations to reset it for you.
              </p>
              <Link href="/login" className="inline-block text-sm text-brand-700 underline">
                Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <p className="mt-1 text-sm text-ink-600">
                Enter the address you sign in with and we will send a link.
              </p>
              <form action="/api/auth/forgot" method="post" className="mt-6 space-y-4">
                <input type="hidden" name="locale" value="en" />
                <Field label="Email" htmlFor="email" required>
                  <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
                </Field>
                <Button type="submit" className="w-full">Send reset link</Button>
              </form>
              <Link href="/login" className="mt-6 inline-block text-sm text-brand-700 underline">
                Back to sign in
              </Link>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
