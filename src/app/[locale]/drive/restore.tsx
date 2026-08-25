"use client";

import { useEffect } from "react";

const KEY = "rg.driver-application.draft";

/**
 * Keeps a driver's answers when the form comes back with an error.
 *
 * The form is a plain POST that answers with a redirect carrying error codes
 * and nothing else — deliberately, so an applicant's details never travel in
 * a URL, a log line or a referrer header. The cost was brutal: a driver who
 * tripped any check returned to a completely empty form and had to retype
 * everything. That is what made a real applicant give up.
 *
 * So the draft is kept in the applicant's own tab instead: written on submit,
 * put back only when the server reports an error, and deleted the moment the
 * application is accepted or the tab closes. Nothing crosses the network that
 * did not already.
 *
 * Passwords are not part of this form. File inputs cannot be restored by
 * design, and there are none here — documents are uploaded later from the
 * driver's own portal.
 */
export function RestoreApplication({ hadError, sent }: { hadError: boolean; sent: boolean }) {
  useEffect(() => {
    const form = document.querySelector<HTMLFormElement>("form[action='/api/driver-applications']");
    if (!form) return;

    if (sent) {
      sessionStorage.removeItem(KEY);
      return;
    }

    if (hadError) {
      try {
        const saved = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as Record<string, unknown> | null;
        if (saved) {
          for (const element of Array.from(form.elements)) {
            const field = element as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
            if (!field.name || field.name === "website") continue;
            const value = saved[field.name];
            if (value === undefined) continue;

            if (field instanceof HTMLInputElement && (field.type === "checkbox" || field.type === "radio")) {
              // Multiple checkboxes can share a name (spoken languages), so
              // the saved value is a list of the values that were ticked.
              field.checked = Array.isArray(value)
                ? (value as string[]).includes(field.value)
                : Boolean(value);
            } else if (typeof value === "string") {
              field.value = value;
            }
          }
        }
      } catch {
        // A corrupt draft is not worth breaking the page over; the form is
        // simply blank, which is exactly where we were before.
      }
      // Put the failure in front of the applicant rather than leaving them at
      // the top of a form they have already filled in.
      document.getElementById("apply-error")?.scrollIntoView({ block: "center" });
    }

    const save = () => {
      const draft: Record<string, string | string[]> = {};
      for (const element of Array.from(form.elements)) {
        const field = element as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
        if (!field.name || field.name === "website") continue;

        if (field instanceof HTMLInputElement && (field.type === "checkbox" || field.type === "radio")) {
          if (!field.checked) continue;
          const existing = draft[field.name];
          draft[field.name] = Array.isArray(existing) ? [...existing, field.value] : [field.value];
        } else {
          draft[field.name] = field.value;
        }
      }
      try {
        sessionStorage.setItem(KEY, JSON.stringify(draft));
      } catch {
        // Private mode with storage disabled: the submit still goes through.
      }
    };

    form.addEventListener("submit", save);
    return () => form.removeEventListener("submit", save);
  }, [hadError, sent]);

  return null;
}
