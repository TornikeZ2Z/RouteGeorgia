-- =========================================================================
-- 0016 — the counterparty is the company, not its director
--
-- Both agreements opened by naming the director who represents the company.
-- That is how a negotiated one-off contract reads, and the wrong shape for
-- these: the driver agreement is signed electronically by hundreds of people
-- against standing terms, and nobody at the company hand-signs a copy. Naming
-- a director there means reissuing every agreement when the director changes,
-- for no benefit to either side.
--
-- The company remains fully identified — registered name, identification
-- number and address — which is what actually establishes who the
-- counterparty is.
--
-- The school agreement is different: it is signed on paper by both sides. So
-- rather than dropping the name entirely, its signature block now asks whoever
-- signs to write their own name and position, which is what a paper contract
-- does anyway and stays true whoever holds the post on the day.
--
-- Amended in place rather than issued as a new version: contract_signatures is
-- empty, so there is no signature whose meaning depends on the old wording.
-- Were even one signature to exist, this would have to be a new version.
-- =========================================================================

DO $guard$
BEGIN
  IF (SELECT count(*) FROM contract_signatures) > 0
     OR (SELECT count(*) FROM school_agreement_signatures) > 0 THEN
    RAISE EXCEPTION
      'contracts have been signed; amend by publishing a new version rather than editing this text'
      USING ERRCODE = 'check_violation';
  END IF;
END $guard$;

-- ------------------------------------------------------- opening paragraph --
UPDATE contract_versions SET body = replace(
  body,
  ', წარმოდგენილი მისი დირექტორის {{COMPANY_DIRECTOR}} მიერ,',
  ',') WHERE locale = 'ka';

UPDATE contract_versions SET body = replace(
  body,
  ', წარმოდგენილი დირექტორის {{COMPANY_DIRECTOR}} მიერ,',
  ',') WHERE locale = 'ka';

UPDATE contract_versions SET body = replace(
  body,
  ', represented by its director {{COMPANY_DIRECTOR}} (the "Company")',
  ' (the "Company")') WHERE locale = 'en';

UPDATE contract_versions SET body = replace(
  body,
  ', represented by its director {{COMPANY_DIRECTOR}} (the "Service Provider")',
  ' (the "Service Provider")') WHERE locale = 'en';

-- ---------------------------------------------------- schedule of details --
UPDATE contract_versions SET body = replace(
  body, ', დირექტორი: {{COMPANY_DIRECTOR}},', ',') WHERE locale = 'ka';

UPDATE contract_versions SET body = replace(
  body, ', director: {{COMPANY_DIRECTOR}},', ',') WHERE locale = 'en';

UPDATE contract_versions SET updated_at = now()
WHERE body NOT LIKE '%{{COMPANY_DIRECTOR}}%';

-- ------------------------------------------ who actually signs on paper --
-- The school agreement is countersigned in a meeting. Whoever holds the pen
-- writes their own name and position, so the instrument records the real
-- signatory rather than whoever was director when the template was written.
UPDATE contract_versions SET body = replace(
  body,
  'ხელმოწერა: ______________________          ხელმოწერა: ______________________',
  'მომსახურების მიმწოდებლის სახელით ხელმომწერი (სახელი, გვარი, თანამდებობა): ______________________

სკოლის სახელით ხელმომწერი (სახელი, გვარი, თანამდებობა): ______________________

ხელმოწერა: ______________________          ხელმოწერა: ______________________')
WHERE party_type = 'SCHOOL' AND locale = 'ka';

UPDATE contract_versions SET body = replace(
  body,
  'Signature: ______________________          Signature: ______________________',
  'Signing for the Service Provider (name and position): ______________________

Signing for the School (name and position): ______________________

Signature: ______________________          Signature: ______________________')
WHERE party_type = 'SCHOOL' AND locale = 'en';

-- ------------------------------------------------------------- assertion --
-- The placeholder must be gone from every body. A silent partial replace
-- would leave "{{COMPANY_DIRECTOR}}" printed in a legal document, which is
-- exactly the failure this migration exists to prevent.
DO $verify$
DECLARE
  leftover INT;
BEGIN
  SELECT count(*) INTO leftover FROM contract_versions
  WHERE body LIKE '%{{COMPANY_DIRECTOR}}%';
  IF leftover > 0 THEN
    RAISE EXCEPTION 'COMPANY_DIRECTOR still present in % contract body/bodies', leftover
      USING ERRCODE = 'check_violation';
  END IF;
END $verify$;
