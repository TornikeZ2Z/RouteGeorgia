"use client";

import { useState, useTransition } from "react";
import { Alert, Button, Card } from "@/components/ui";
import { submitApplicationAction } from "../actions";

export function SubmitApplication() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);

  return (
    <Card className="p-4 sm:p-6">
      <h2 className="font-semibold text-ink-900">Submit for review</h2>
      <p className="mt-1 text-sm text-ink-600">
        You need a vehicle, your identity, licence and insurance documents, and at least one language
        before operations can review your application.
      </p>
      {result && (
        <div className="mt-3">
          <Alert tone={result.ok ? "success" : "warning"}>{result.message}</Alert>
        </div>
      )}
      <Button
        className="mt-4"
        disabled={pending}
        onClick={() => start(async () => setResult(await submitApplicationAction()))}
      >
        {pending ? "Submitting…" : "Submit application"}
      </Button>
    </Card>
  );
}
