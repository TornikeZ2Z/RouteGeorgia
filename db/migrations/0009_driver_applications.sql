-- =========================================================================
-- 0009 — public driver applications
--
-- Until now a driver could only enter the system through /admin/drivers:
-- somebody in the office typed their details and handed them a one-time
-- password. That does not scale past the first dozen, and every applicant
-- who found the site had nowhere to go.
--
-- The public application form writes the same records staff would have
-- created, so nothing downstream changes: the file still lands in the
-- verification queue as SUBMITTED, documents still start PENDING, and no
-- application can publish itself. These columns record where a file came
-- from and what the applicant declared about themselves, both of which a
-- reviewer needs and neither of which existed before.
-- =========================================================================

ALTER TABLE driver_profiles
  ADD COLUMN IF NOT EXISTS applied_via      TEXT NOT NULL DEFAULT 'staff',
  ADD COLUMN IF NOT EXISTS experience_years INTEGER,
  ADD COLUMN IF NOT EXISTS referral_source  TEXT;

-- 'staff' is the right default for every row that already exists: they were
-- all typed in by an operator.
ALTER TABLE driver_profiles
  DROP CONSTRAINT IF EXISTS driver_profiles_applied_via_ck;
ALTER TABLE driver_profiles
  ADD CONSTRAINT driver_profiles_applied_via_ck
  CHECK (applied_via IN ('staff', 'public_form', 'import'));

ALTER TABLE driver_profiles
  DROP CONSTRAINT IF EXISTS driver_profiles_experience_ck;
ALTER TABLE driver_profiles
  ADD CONSTRAINT driver_profiles_experience_ck
  CHECK (experience_years IS NULL OR experience_years BETWEEN 0 AND 70);

-- The verification queue is read far more often than it is written, and it
-- is always read oldest-first within a status.
CREATE INDEX IF NOT EXISTS driver_profiles_queue_idx
  ON driver_profiles (status, submitted_at)
  WHERE status IN ('SUBMITTED', 'IN_REVIEW', 'CHANGES_REQUESTED');
