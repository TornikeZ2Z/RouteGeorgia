"use client";

import { useActionState, useState, useTransition } from "react";
import { sendDriverMessageAction, translateMessageAction } from "./actions";

export interface ThreadMessage {
  id: string;
  sender: string;
  body: string;
  createdAt: string;
  /** True when the text is not already in the driver's own language. */
  foreign: boolean;
}

export interface ThreadLabels {
  title: string;
  empty: string;
  you: string;
  traveller: string;
  support: string;
  placeholder: string;
  send: string;
  sending: string;
  translate: string;
  translating: string;
  original: string;
  unavailable: string;
}

const INITIAL = { ok: false } as const;

/**
 * The driver's half of the conversation.
 *
 * Translation is per message and on demand rather than on page load: the free
 * engine is rate-limited, most messages are short and obvious, and a driver
 * with twenty orders should not trigger a hundred calls to open a page.
 */
export function MessageThread({
  bookingId, messages, labels,
}: { bookingId: string; messages: ThreadMessage[]; labels: ThreadLabels }) {
  const [state, action] = useActionState(sendDriverMessageAction, INITIAL);

  return (
    <div className="mt-4 border-t border-ink-100 pt-4">
      <h4 className="mb-2 text-sm font-semibold text-ink-800">{labels.title}</h4>

      {messages.length === 0 ? (
        <p className="text-sm text-ink-500">{labels.empty}</p>
      ) : (
        <ul className="mb-3 space-y-2">
          {messages.map((m) => (
            <Message key={m.id} message={m} labels={labels} />
          ))}
        </ul>
      )}

      <form action={action} className="flex flex-col gap-2 sm:flex-row">
        <input type="hidden" name="bookingId" value={bookingId} />
        <input
          name="body"
          required
          maxLength={4000}
          placeholder={labels.placeholder}
          className="min-h-11 flex-1 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus:border-ink-900 focus:outline-none"
        />
        <SendButton labels={labels} />
      </form>

      {state.message && (
        <p
          role="status"
          className={`mt-1.5 text-xs ${state.ok ? "text-ink-500" : "text-[--color-danger]"}`}
        >
          {state.message}
        </p>
      )}
    </div>
  );
}

function SendButton({ labels }: { labels: ThreadLabels }) {
  return (
    <button
      type="submit"
      className="min-h-11 rounded-lg bg-pine-800 px-4 text-sm font-semibold text-white hover:bg-pine-700"
    >
      {labels.send}
    </button>
  );
}

function Message({ message, labels }: { message: ThreadMessage; labels: ThreadLabels }) {
  const [translated, setTranslated] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [showing, setShowing] = useState(true);
  const [pending, start] = useTransition();

  const mine = message.sender === "DRIVER";
  const who = mine ? labels.you : message.sender === "SUPPORT" ? labels.support : labels.traveller;

  const onTranslate = () => {
    if (translated) return setShowing((s) => !s);
    start(async () => {
      const result = await translateMessageAction(message.id);
      if (result.ok && result.body) {
        setTranslated(result.body);
        setShowing(true);
      } else {
        setFailed(true);
      }
    });
  };

  return (
    <li
      className={
        mine
          ? "rounded-lg bg-pine-50 px-3 py-2 text-sm"
          : "rounded-lg bg-ink-50 px-3 py-2 text-sm"
      }
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-ink-700">{who}</span>
        <span className="text-xs text-ink-400">{message.createdAt}</span>
      </div>

      <p className="mt-1 whitespace-pre-wrap text-ink-800">
        {translated && showing ? translated : message.body}
      </p>

      {/* Only offered where it could help: a message already in the driver's
          language has nothing to translate. */}
      {message.foreign && !mine && (
        <div className="mt-1.5 flex items-center gap-2">
          <button
            type="button"
            onClick={onTranslate}
            disabled={pending}
            className="text-xs text-ink-500 underline hover:text-ink-900 disabled:opacity-50"
          >
            {pending
              ? labels.translating
              : translated
                ? showing
                  ? labels.original
                  : labels.translate
                : labels.translate}
          </button>
          {failed && <span className="text-xs text-ink-400">{labels.unavailable}</span>}
        </div>
      )}
    </li>
  );
}
