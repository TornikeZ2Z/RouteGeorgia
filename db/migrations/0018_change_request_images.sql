-- =========================================================================
-- 0018 — screenshots on change requests, and a shorter form
--
-- Asking somebody to describe a visual problem in prose is asking them to do
-- the hardest part of the job. A screenshot says it in one go, and the people
-- this form is for already have one on their clipboard when they open it.
--
-- Stored in the restricted bucket, not the public one. A screenshot of the
-- operations console shows real customer names, phone numbers and pickup
-- addresses; serving those from an unauthenticated path because they happen
-- to be attached to a feature request would be a data leak with extra steps.
-- Same bucket and the same serving discipline as driver documents and support
-- attachments.
--
-- The form also loses three fields — contact, reason and urgency. They were
-- worth asking for on paper and not worth the friction in practice: every
-- extra box on a form nobody is obliged to fill in is a reason to close the
-- tab. The columns stay, nullable and defaulted, so triage can still set an
-- urgency in the console and so none of this needs undoing if the fields
-- earn their place back.
-- =========================================================================

CREATE TABLE change_request_images (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id   UUID NOT NULL REFERENCES change_requests(id) ON DELETE CASCADE,
  storage_key  TEXT NOT NULL,
  mime_type    TEXT NOT NULL,
  size_bytes   BIGINT NOT NULL,
  checksum     TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- The restricted prefix is the whole point of the table. A row pointing
  -- anywhere else would be served by a route that assumes otherwise.
  CONSTRAINT change_request_images_restricted_ck
    CHECK (storage_key LIKE 'restricted-kyc/%'),
  CONSTRAINT change_request_images_mime_ck
    CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  CONSTRAINT change_request_images_size_ck
    CHECK (size_bytes > 0 AND size_bytes <= 12 * 1024 * 1024)
);

CREATE INDEX change_request_images_request_idx
  ON change_request_images (request_id, created_at);

COMMENT ON TABLE change_request_images IS
  'Screenshots attached to a change request. Restricted: they routinely show customer data.';
