-- =========================================================================
-- 0011 — insurance is no longer collected, and version 1 goes live
--
-- The driver team asked for insurance to be dropped from onboarding: it is
-- not requested on the application form, and it is no longer a condition of
-- publication.
--
-- What is REMOVED here is only the promise that we gather and check an
-- insurance policy. What stays is the driver's own obligation to hold
-- whatever the law requires, and the clause making it a serious breach to
-- drive without it. Carrying passengers for payment uninsured is unlawful in
-- Georgia whatever this platform asks for, and a contract that quietly
-- dropped the obligation would leave both sides worse off in an incident.
--
-- Targeted replacements rather than a rewritten body: the change is small,
-- and this way the diff shows exactly which sentences moved.
-- =========================================================================

UPDATE contract_versions SET body = replace(
  body,
  'We verify what you have sent: identity, driving licence, vehicle registration and insurance.',
  'We verify what you have sent: identity, driving licence and vehicle registration.'
) WHERE version = '2026-08-v1' AND locale = 'en';

UPDATE contract_versions SET body = replace(
  body,
  'a new phone number, a new vehicle, a renewed licence or insurance policy',
  'a new phone number, a new vehicle, a renewed licence'
) WHERE version = '2026-08-v1' AND locale = 'en';

-- The data-protection section must list what we actually hold. We no longer
-- hold an insurance policy, so claiming we do would be wrong in the one
-- section a driver is most entitled to rely on.
UPDATE contract_versions SET body = replace(
  body,
  'identity document, driving licence, vehicle registration, insurance policy, bank details',
  'identity document, driving licence, vehicle registration, bank details'
) WHERE version = '2026-08-v1' AND locale = 'en';

UPDATE contract_versions SET body = replace(
  body,
  'ჩვენ ვამოწმებთ მოწოდებულს: პირადობას, მართვის მოწმობას, ავტომობილის რეგისტრაციასა და დაზღვევას.',
  'ჩვენ ვამოწმებთ მოწოდებულს: პირადობას, მართვის მოწმობას და ავტომობილის რეგისტრაციას.'
) WHERE version = '2026-08-v1' AND locale = 'ka';

UPDATE contract_versions SET body = replace(
  body,
  'ტელეფონის ნომერი, ავტომობილი, განახლებული მართვის მოწმობა ან დაზღვევა',
  'ტელეფონის ნომერი, ავტომობილი, განახლებული მართვის მოწმობა'
) WHERE version = '2026-08-v1' AND locale = 'ka';

UPDATE contract_versions SET body = replace(
  body,
  'პირადობის დამადასტურებელ დოკუმენტს, მართვის მოწმობას, ავტომობილის რეგისტრაციას, დაზღვევის პოლისს, საბანკო რეკვიზიტებს',
  'პირადობის დამადასტურებელ დოკუმენტს, მართვის მოწმობას, ავტომობილის რეგისტრაციას, საბანკო რეკვიზიტებს'
) WHERE version = '2026-08-v1' AND locale = 'ka';

UPDATE contract_versions SET updated_at = now() WHERE version = '2026-08-v1';

-- ------------------------------------------------------------------ live --
-- Publishing the row only makes the agreement *offerable*. The application
-- still refuses to show or accept a signature while COMPANY_LEGAL_NAME,
-- COMPANY_ID_NUMBER or COMPANY_ADDRESS is unset, so this cannot put an
-- unfinished contract in front of a driver on its own.
UPDATE contract_versions SET published = true WHERE version = '2026-08-v1';
