-- =========================================================================
-- 0012 — settings an operator can change without a deploy
--
-- Two numbers were baked into environment variables and therefore into a
-- redeploy: the commission RouteGeorgia takes, and the floor under a day of
-- a driver's time. Both are commercial decisions that change faster than
-- code ships, so they move into the database behind an audited form.
--
-- What deliberately does NOT change when these values change:
--
--   * Existing quotes. QuoteInputs snapshots commissionRateBps and the fare
--     floors, so a booking replays at the numbers that priced it.
--   * Existing signatures. contract_signatures.evidence already records the
--     commission that was in force when the driver signed, so a later change
--     cannot rewrite what somebody agreed to.
--
-- Values are stored as text and parsed by the application, so one table can
-- hold different types without a migration per setting.
-- =========================================================================

CREATE TABLE platform_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL
);

COMMENT ON TABLE platform_settings IS
  'Operator-editable commercial settings. Changes are audited in audit_logs.';

-- Seeded from what the environment currently says, so switching to the table
-- is a no-op until somebody deliberately edits a value.
INSERT INTO platform_settings (key, value) VALUES
  -- RouteGeorgia's cut of the fare, in basis points. 1500 = 15%.
  ('commission_rate_bps', '1500'),
  -- Floor under a day of a driver's time, in minor units (tetri), applied to
  -- day-based work — tours and multi-day hire — instead of distance. 0 is off.
  -- A transfer is not day-based and is never touched by this.
  ('minimum_day_fare_minor', '0')
ON CONFLICT (key) DO NOTHING;
