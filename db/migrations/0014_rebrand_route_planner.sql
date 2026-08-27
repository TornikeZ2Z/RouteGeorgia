-- =========================================================================
-- 0014 — the platform is now Route Planner
--
-- The trading name changed; the company did not. The National Agency of
-- Public Registry has the entity registered as რაუტ ჯორჯია / ROUTE GEORGIA,
-- and a contract has to name the party that actually exists. So the legal
-- name stays exactly where it is — supplied at render time from
-- COMPANY_LEGAL_NAME — and the agreement now says plainly that this company
-- trades as Route Planner. Everything that was a brand reference becomes
-- Route Planner; nothing that is a legal reference moves.
--
-- Editing a published contract in place is normally forbidden: a signature
-- stores the SHA-256 of the exact text it covered, and changing the text
-- underneath a signature would break that promise. It is safe here only
-- because nobody has signed yet, and the guard below refuses to run if that
-- has stopped being true between writing this and applying it. If it fires,
-- the correct move is a new contract version, not a louder hammer.
-- =========================================================================

DO $rebrand$
DECLARE
  signature_count INTEGER;
BEGIN
  SELECT count(*) INTO signature_count FROM contract_signatures;

  IF signature_count > 0 THEN
    RAISE EXCEPTION
      'REFUSING to rewrite a signed agreement: % signature(s) exist. '
      'Publish a new contract version instead, so what each driver signed stays provable.',
      signature_count;
  END IF;

  -- The defined term and every brand mention in the body.
  UPDATE contract_versions
  SET body  = replace(body, 'RouteGeorgia', 'Route Planner'),
      title = replace(title, 'RouteGeorgia', 'Route Planner'),
      updated_at = now()
  WHERE body LIKE '%RouteGeorgia%' OR title LIKE '%RouteGeorgia%';

  -- Georgian genitive: "Route Planner-ის მძღოლის ხელშეკრულება" reads
  -- correctly, where the mechanical replace above leaves "Route Planner-ს".
  UPDATE contract_versions
  SET title = 'Route Planner-ის მძღოლის ხელშეკრულება'
  WHERE locale = 'ka' AND title LIKE '%მძღოლის ხელშეკრულება%';

  -- State the trading name where the counterparty is identified, so a driver
  -- reading the agreement can see that the company they are contracting with
  -- is the one whose name is on the website.
  UPDATE contract_versions
  SET body = replace(
        body,
        'with its registered address at {{COMPANY_ADDRESS}} ("Route Planner", "we", "us")',
        'with its registered address at {{COMPANY_ADDRESS}}, trading under the name Route Planner ("Route Planner", "we", "us")')
  WHERE locale = 'en';

  UPDATE contract_versions
  SET body = replace(
        body,
        'იურიდიული მისამართი: {{COMPANY_ADDRESS}}; შემდგომში „Route Planner“',
        'იურიდიული მისამართი: {{COMPANY_ADDRESS}}; საქმიანობას ეწევა სახელწოდებით Route Planner; შემდგომში „Route Planner“')
  WHERE locale = 'ka';
END
$rebrand$;

-- The cached machine translations were produced under the old brand and are
-- cheap to rebuild on demand; dropping them avoids a stale name surfacing in
-- a translated message.
DELETE FROM message_translations;
