"use client";

import { useState, useTransition } from "react";
import { Alert, Button, Card } from "@/components/ui";
import { submitApplicationAction } from "../actions";

export function SubmitApplication({ labels }: { labels: { title: string; body: string; cta: string; pending: string } }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);

  return (
    <Card className="p-4 sm:p-6">
      <h2 className="font-semibold text-ink-900">{labels.title}</h2>
      <p className="mt-1 text-sm text-ink-600">{labels.body}</p>
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
        {pending ? labels.pending : labels.cta}
      </Button>
    </Card>
  );
}
