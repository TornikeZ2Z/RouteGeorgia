---
description: Read the team's change-request queue and report it. Does not start work.
---

Run the change-request queue and report what is in it.

```bash
npm run requests
```

Pass any argument the user gave through to it:

- a reference such as `CR-2026-0003` — show just that one
- `--all` — include closed requests

Then report back:

- One line per request: reference, title, who filed it, and the area.
- Lead with anything marked high urgency, and say if there is nothing open.
- If a request has screenshots, say so — for a visual report the screenshot
  usually *is* the report, and the description alone will mislead. Screenshots
  are at `/admin/requests/<id>` in the console; they are not in the terminal
  output because they are restricted images.

**Do not start work on anything.** The queue is read on request and acted on
when the user says which one. Finish by asking which they want, or confirming
there is nothing waiting.

When they do say to work on one:

1. Mark it started, so the console reflects reality while you are on it:
   `npm run requests -- --start CR-2026-0003`
2. Do the work. The brief names the likely area of the codebase — read the
   comments around whatever you are about to change before changing it, and
   check the request against the database invariants in `HANDOVER.md` section 9.
   If it conflicts with one, say so rather than working around it.
3. When it is finished and verified:
   `npm run requests -- --done CR-2026-0003 "what actually changed"`
   That note is read by the person who filed it, so write it for them.

If a request should not be done, decline it with a reason rather than leaving
it open — `npm run requests -- --decline CR-2026-0003 "why not"`. Somebody took
the trouble to file it, and closing it silently is how you stop receiving them.
