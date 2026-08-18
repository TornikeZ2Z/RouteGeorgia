-- =========================================================================
-- 0006 — remove a table nothing uses
--
-- staff_invitations was created for an invite-and-accept flow. What was built
-- instead grants roles directly and shows a one-time password once, which is
-- fewer moving parts and no worse: the password is never emailed either way.
--
-- An unused table is not harmless. It shows up in every schema review, invites
-- someone to build against it later, and makes the audit question "is anything
-- in here dead?" harder to answer honestly.
-- =========================================================================

DROP TABLE IF EXISTS staff_invitations;
