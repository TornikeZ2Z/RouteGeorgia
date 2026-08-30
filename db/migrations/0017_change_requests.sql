-- =========================================================================
-- 0017 — change requests from the team
--
-- People who work with the product every day notice things before anyone
-- else does, and the ones who notice most are usually the ones least able to
-- open a pull request. Until now that feedback arrived as messages that got
-- lost, so this gives it somewhere to land: a form on an unguessable link
-- that needs no account, and a queue in the console that keeps the request
-- until somebody has actually dealt with it.
--
-- Deliberately not a support ticket. A ticket is a problem with one booking
-- and closes when that booking is sorted; a change request is a claim about
-- how the product should behave, and it stays open across releases. Sharing
-- the tickets table would have meant one queue where the two kinds drown
-- each other out.
--
-- The submitter is self-reported, because requiring an account is exactly
-- the friction that keeps people quiet. That is recorded honestly rather
-- than pretended away: `submitted_by_user_id` is set only when a signed-in
-- member of staff submits, and the console shows the difference.
-- =========================================================================

CREATE TABLE change_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Human-facing number, so a request can be spoken about in a meeting.
  reference    TEXT NOT NULL,

  title        TEXT NOT NULL,
  -- What they want. Free text on purpose: a form that demands a well-formed
  -- specification collects nothing from the people worth hearing from.
  body         TEXT NOT NULL,
  -- Why they want it. Optional, and the single most useful field when it is
  -- filled in — it is what lets someone judge a request they did not receive.
  reason       TEXT,

  area         TEXT NOT NULL DEFAULT 'OTHER',
  urgency      TEXT NOT NULL DEFAULT 'NORMAL',

  submitted_by_name    TEXT NOT NULL,
  submitted_by_contact TEXT,
  -- Set only for a signed-in submission. NULL means the name above is
  -- self-reported and was not verified by anything.
  submitted_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,

  status       TEXT NOT NULL DEFAULT 'NEW',
  -- Required when a request is declined. Someone took the trouble to write
  -- it; closing it silently is how you stop receiving them.
  resolution   TEXT,

  -- Kept for abuse handling on a form that has no login.
  ip           TEXT,
  user_agent   TEXT,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT change_requests_status_ck
    CHECK (status IN ('NEW', 'TRIAGED', 'IN_PROGRESS', 'DONE', 'DECLINED')),
  CONSTRAINT change_requests_urgency_ck
    CHECK (urgency IN ('LOW', 'NORMAL', 'HIGH')),
  CONSTRAINT change_requests_area_ck
    CHECK (area IN ('BOOKING', 'DRIVER', 'SCHOOL', 'PRICING', 'ADMIN',
                    'PUBLIC_SITE', 'CONTENT', 'OTHER')),
  CONSTRAINT change_requests_title_ck CHECK (length(btrim(title)) BETWEEN 4 AND 160),
  CONSTRAINT change_requests_body_ck CHECK (length(btrim(body)) BETWEEN 10 AND 4000),
  CONSTRAINT change_requests_name_ck CHECK (length(btrim(submitted_by_name)) BETWEEN 2 AND 120),
  -- A closed request must say what happened to it.
  CONSTRAINT change_requests_resolution_ck
    CHECK (status <> 'DECLINED' OR length(btrim(coalesce(resolution, ''))) >= 5)
);

CREATE UNIQUE INDEX change_requests_reference_idx ON change_requests (reference);
-- The queue is read newest-open-first almost every time it is opened.
CREATE INDEX change_requests_queue_idx ON change_requests (status, created_at DESC);

COMMENT ON TABLE change_requests IS
  'Change requests submitted by the team. Not support tickets — see 0017.';
COMMENT ON COLUMN change_requests.submitted_by_user_id IS
  'NULL means submitted_by_name is self-reported and unverified.';
