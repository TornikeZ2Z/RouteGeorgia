-- =========================================================================
-- 0015 — the lawyer's agreements, and the school counterparty
--
-- Two things arrive here.
--
--   1. The driver agreement is replaced. Version 2026-08-v1 was a plain
--      English draft written to have *something* enforceable in place; this
--      is the drafted Georgian instrument, and Georgian now governs. Nobody
--      has signed v1 (0 rows), so this is a straight swap rather than a
--      re-signing exercise.
--
--   2. Schools become a counterparty the system knows about. Until now a
--      school was a lead that landed in the support queue; the school
--      agreement gives them a contract, an order sheet and a lifecycle, so
--      they need somewhere to live.
--
-- The contract store is generalised rather than duplicated: the same
-- versioning, the same hash-on-what-was-read discipline, and the same
-- append-only signatures now serve both counterparties, keyed by party_type.
-- =========================================================================

-- ------------------------------------------------- driver legal identity --
-- The agreement identifies the driver by personal number, which is how a
-- natural person is identified in a Georgian contract. Article 2.1.1 already
-- requires the underlying ID document, so this is recording what we are
-- obliged to have seen. Nullable: existing drivers are not retroactively
-- broken, and the contract page collects it at the moment it is needed.
ALTER TABLE driver_profiles
  ADD COLUMN personal_number TEXT,
  ADD COLUMN legal_address   TEXT;

COMMENT ON COLUMN driver_profiles.personal_number IS
  'Georgian personal number. Named in the driver agreement opening paragraph.';
COMMENT ON COLUMN driver_profiles.legal_address IS
  'Registered address as it appears in the agreement.';

-- ------------------------------------------------ contracts by party type --
ALTER TABLE contract_versions
  ADD COLUMN party_type TEXT NOT NULL DEFAULT 'DRIVER';

ALTER TABLE contract_versions
  ADD CONSTRAINT contract_versions_party_ck CHECK (party_type IN ('DRIVER', 'SCHOOL'));

-- A version number is only unique within its counterparty: the driver
-- agreement and the school agreement version independently of each other.
-- The original constraint predates party_type and would reject the school
-- agreement's 2026-08-v1 purely because the driver agreement already used
-- that number, so it is replaced rather than supplemented.
ALTER TABLE contract_versions DROP CONSTRAINT contract_versions_version_locale_uq;

CREATE UNIQUE INDEX contract_versions_party_version_locale_idx
  ON contract_versions (party_type, version, locale);

-- Replaced rather than overloaded: a defaulted argument alongside the old
-- zero-argument form would be ambiguous to the planner.
DROP FUNCTION IF EXISTS current_contract_version();

CREATE FUNCTION current_contract_version(p_party_type TEXT DEFAULT 'DRIVER')
RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT version FROM contract_versions
  WHERE published AND party_type = p_party_type
  ORDER BY effective_from DESC, version DESC
  LIMIT 1
$$;

COMMENT ON FUNCTION current_contract_version(TEXT) IS
  'The agreement currently on offer to the given counterparty; NULL when none is published.';

-- =========================================================================
-- Schools as a counterparty
-- =========================================================================

CREATE TABLE school_clients (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- As it must appear in the agreement: full registered name and code.
  name         TEXT NOT NULL,
  id_number    TEXT NOT NULL,
  director     TEXT NOT NULL,
  address      TEXT,
  phone        TEXT,
  email        TEXT,
  -- PROSPECT until the agreement is signed; only ACTIVE schools may order.
  status       TEXT NOT NULL DEFAULT 'PROSPECT',
  notes        TEXT,
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT school_clients_status_ck
    CHECK (status IN ('PROSPECT', 'ACTIVE', 'SUSPENDED', 'CLOSED')),
  CONSTRAINT school_clients_name_ck CHECK (length(btrim(name)) >= 2),
  CONSTRAINT school_clients_id_number_ck CHECK (length(btrim(id_number)) >= 5)
);

CREATE UNIQUE INDEX school_clients_id_number_idx ON school_clients (id_number);
CREATE INDEX school_clients_status_idx ON school_clients (status);

-- A school signs on paper, in a meeting, far more often than it signs in a
-- browser. What matters is the same as for a driver: which text, which hash,
-- who signed, and when — so the record is identical in substance and differs
-- only in admitting that the act happened offline.
CREATE TABLE school_agreement_signatures (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID NOT NULL REFERENCES school_clients(id) ON DELETE CASCADE,
  contract_version TEXT NOT NULL,
  locale           TEXT NOT NULL,
  signed_name      TEXT NOT NULL,
  signed_role      TEXT,
  body_hash        TEXT NOT NULL,
  -- How the signature was obtained. Recorded because "we have it on paper in
  -- the office" and "they clicked a button" are different kinds of evidence.
  method           TEXT NOT NULL DEFAULT 'IN_PERSON',
  signed_at        TIMESTAMPTZ NOT NULL,
  recorded_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  recorded_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  evidence         JSONB NOT NULL DEFAULT '{}',
  CONSTRAINT school_agreement_signatures_once UNIQUE (school_id, contract_version),
  CONSTRAINT school_agreement_signatures_method_ck
    CHECK (method IN ('IN_PERSON', 'SCANNED', 'ELECTRONIC')),
  CONSTRAINT school_agreement_signatures_name_ck CHECK (length(btrim(signed_name)) >= 3),
  CONSTRAINT school_agreement_signatures_locale_ck CHECK (locale IN ('en', 'ka'))
);

CREATE INDEX school_agreement_signatures_school_idx
  ON school_agreement_signatures (school_id);

CREATE TRIGGER school_agreement_signatures_no_update
  BEFORE UPDATE ON school_agreement_signatures
  FOR EACH ROW EXECUTE FUNCTION audit_logs_append_only();

-- ------------------------------------------------------------- Annex 1 --
-- Article 1.3 makes each trip a separate annex to the agreement, and Annex 1
-- of the drafted document is the form it takes. This table is that form: one
-- row is one order sheet, and the printed sheet is a rendering of the row.
CREATE TABLE school_orders (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id          UUID NOT NULL REFERENCES school_clients(id) ON DELETE RESTRICT,
  -- Human-facing order number that appears at the top of the printed sheet.
  reference          TEXT NOT NULL,

  trip_date          DATE NOT NULL,
  pickup_place       TEXT NOT NULL,
  destination        TEXT NOT NULL,
  route              TEXT,
  depart_at          TIMESTAMPTZ,
  return_estimate_at TIMESTAMPTZ,

  students           INTEGER NOT NULL,
  chaperones         INTEGER NOT NULL DEFAULT 0,
  vehicle_type       TEXT,

  -- Article 7. PLUS and PREMIUM include a Safety Coordinator, but the flag is
  -- stored rather than derived: a STANDARD booking may add one by agreement,
  -- and a printed annex must say what was actually sold.
  package            TEXT NOT NULL DEFAULT 'STANDARD',
  safety_coordinator BOOLEAN NOT NULL DEFAULT false,
  parent_updates     BOOLEAN NOT NULL DEFAULT false,

  total_price_minor  BIGINT NOT NULL DEFAULT 0,
  prepaid_minor      BIGINT NOT NULL DEFAULT 0,
  extra_terms        TEXT,

  school_contact_name  TEXT,
  school_contact_phone TEXT,
  provider_contact_name  TEXT,
  provider_contact_phone TEXT,

  driver_id          UUID REFERENCES driver_profiles(id) ON DELETE SET NULL,
  status             TEXT NOT NULL DEFAULT 'DRAFT',
  cancelled_reason   TEXT,

  created_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT school_orders_package_ck CHECK (package IN ('STANDARD', 'PLUS', 'PREMIUM')),
  CONSTRAINT school_orders_status_ck
    CHECK (status IN ('DRAFT', 'CONFIRMED', 'COMPLETED', 'CANCELLED')),
  CONSTRAINT school_orders_students_ck CHECK (students > 0 AND students <= 500),
  CONSTRAINT school_orders_chaperones_ck CHECK (chaperones >= 0 AND chaperones <= 100),
  CONSTRAINT school_orders_money_ck
    CHECK (total_price_minor >= 0 AND prepaid_minor >= 0 AND prepaid_minor <= total_price_minor)
);

CREATE UNIQUE INDEX school_orders_reference_idx ON school_orders (reference);
CREATE INDEX school_orders_school_idx ON school_orders (school_id, trip_date DESC);
CREATE INDEX school_orders_date_idx ON school_orders (trip_date DESC);

-- A school may only be sent on the road under a signed agreement. Same shape
-- as the driver publish gate: enforced here so no code path can miss it.
CREATE FUNCTION school_order_requires_agreement() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  live_version TEXT := current_contract_version('SCHOOL');
BEGIN
  -- OLD is unassigned on INSERT, so it may only be read on UPDATE.
  IF NEW.status = 'CONFIRMED' AND live_version IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.status <> 'CONFIRMED') THEN
    IF NOT EXISTS (
      SELECT 1 FROM school_agreement_signatures s
      WHERE s.school_id = NEW.school_id AND s.contract_version = live_version
    ) THEN
      RAISE EXCEPTION
        'order % cannot be confirmed: school has not signed the school agreement (%)',
        NEW.reference, live_version
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER school_order_requires_agreement_trg
  BEFORE INSERT OR UPDATE OF status ON school_orders
  FOR EACH ROW EXECUTE FUNCTION school_order_requires_agreement();

-- =========================================================================
-- The driver agreement, version 2. Georgian governs.
--
-- Three corrections to the drafted text, each deliberate:
--
--   * The draft had no Article 9 — it ran 8, 10, 11. Articles 10-16 are
--     renumbered down to 9-15 so the instrument has no gap. No clause
--     cross-references an article number, so nothing else moves. (The two
--     internal references, 3.3 -> 3.2 and 6.5 -> 2.1.7, are untouched.)
--   * The draft numbered two different clauses 12.4 (technical faults, and
--     systematic lateness). The second becomes 11.7 after renumbering.
--   * Typographic: a misspelled "marshrutis" in 2.1.5, a doubled comma in
--     6.6 and a doubled full stop in 3.2.
--
-- The blanks the draft left (commission, settlement cycle, notice period)
-- are placeholders resolved from settings, so a commercial change does not
-- require a new contract version.
-- =========================================================================
INSERT INTO contract_versions (party_type, version, locale, title, body, published) VALUES
('DRIVER', '2026-08-v2', 'ka', 'მძღოლთან პარტნიორობისა და სატრანსპორტო მომსახურების ხელშეკრულება', $contract_ka$
ქ. თბილისი. წინამდებარე ხელშეკრულება იდება ელექტრონული ფორმით და ძალაში შედის პარტნიორი მძღოლის მიერ მისი ელექტრონულად ხელმოწერის მომენტიდან.

ერთი მხრივ, {{COMPANY_LEGAL_NAME}}, ს/კ {{COMPANY_ID_NUMBER}}, წარმოდგენილი მისი დირექტორის {{COMPANY_DIRECTOR}} მიერ, შემდგომში — „კომპანია“, და მეორე მხრივ, {{DRIVER_NAME}}, პირადი ნომერი {{DRIVER_PERSONAL_NUMBER}}, ტელეფონი {{DRIVER_PHONE}}, მისამართი {{DRIVER_ADDRESS}}, შემდგომში — „პარტნიორი მძღოლი“, ერთობლივად — „მხარეები“, ვდებთ წინამდებარე ხელშეკრულებას.

## მუხლი 1. ხელშეკრულების საგანი

1.1. კომპანია ახორციელებს მგზავრთა გადაადგილების, გადაყვანის, საქალაქთაშორისო მგზავრობის, ტურისტული, ოჯახური, ჯგუფური, კორპორაციული და სხვა სახის სატრანსპორტო მომსახურების ორგანიზებას ციფრული პლატფორმისა და პარტნიორი მძღოლების ქსელის მეშვეობით.

1.2. პარტნიორი მძღოლი უერთდება კომპანიის პარტნიორთა ქსელს და კომპანიისგან მიღებული და დადასტურებული შეკვეთების საფუძველზე ახორციელებს მგზავრთა გადაყვანას.

1.3. წინამდებარე ხელშეკრულება წარმოადგენს პარტნიორობისა და მომსახურების ურთიერთობას და თავისთავად არ ქმნის შრომით ურთიერთობას, თუ მხარეთა შორის ცალკე წერილობითი შრომითი ხელშეკრულება არ არსებობს.

1.4. პარტნიორი მძღოლი დამოუკიდებლად მართავს საკუთარ ხელმისაწვდომობას, სამუშაო გრაფიკს და იმ შეკვეთებს, რომელთა შესრულებაზეც თანხმდება.

## მუხლი 2. პარტნიორი მძღოლის მიერ წარსადგენი დოკუმენტაცია

2.1. პარტნიორი მძღოლი ვალდებულია კომპანიას წარუდგინოს:

2.1.1. მოქმედი პირადობის დამადასტურებელი დოკუმენტი;

2.1.2. შესაბამისი კატეგორიის მოქმედი მართვის მოწმობა;

2.1.3. ავტომობილის რეგისტრაციისა და კანონით მოთხოვნილი დოკუმენტები;

2.1.4. მოთხოვნის შემთხვევაში, სსიპ — შსს მომსახურების სააგენტოს მიერ გაცემული მართვის მოწმობაზე დარიცხული ქულების დამადასტურებელი დოკუმენტი;

2.1.5. იმ შემთხვევაში, თუ 1 (ერთი) კალენდარული კვირის განმავლობაში 3 (სამი) ან მეტი მარშრუტის მიმართულება იქნება უცვლელი, საქართველოს ეკონომიკისა და მდგრადი განვითარების სამინისტროს სსიპ — სახმელეთო ტრანსპორტის სააგენტოს ან/და შესაბამისი ადმინისტრაციული ორგანოს მიერ გაცემული სათანადო ნებართვა;

2.1.6. დაზღვევის დამადასტურებელი დოკუმენტი (ასეთის არსებობის შემთხვევაში);

2.1.7. საბანკო/საგადახდო რეკვიზიტები და კომპანიის მიერ მოთხოვნილი სხვა სახის ინფორმაცია.

2.2. პარტნიორი მძღოლი ადასტურებს, რომ მის მიერ წარმოდგენილი ინფორმაცია არის სრული, ზუსტი და მოქმედი.

2.3. პარტნიორი მძღოლი ვალდებულია დაუყოვნებლივ აცნობოს კომპანიას ნებისმიერი დოკუმენტის ვადის გასვლის, შეჩერების, გაუქმების ან სხვა მნიშვნელოვანი ცვლილების შესახებ.

## მუხლი 3. ავტომობილი

3.1. მძღოლი იყენებს მხოლოდ კომპანიაში რეგისტრირებულ და დამტკიცებულ სატრანსპორტო საშუალებას.

3.2. ავტომობილის ტექნიკური და სანიტარიულ-ჰიგიენური მდგომარეობა უნდა შეესაბამებოდეს მოქმედი საგზაო მოძრაობის წესებით, დამამზადებლის ინსტრუქციებით, სტანდარტებით, წინამდებარე წესითა და საქართველოს კანონმდებლობით მათ მიმართ დადგენილ მოთხოვნებს.

3.3. ამ მუხლის 3.2. პუნქტით გათვალისწინებული ტექნიკური და სანიტარიულ-ჰიგიენური მდგომარეობის შემოწმების მიზნით, კომპანია უფლებამოსილია პერიოდულად მოითხოვოს ავტომობილის ფოტოები, დოკუმენტები ან ტექნიკური მდგომარეობის დამადასტურებელი ინფორმაცია.

3.4. ტექნიკური ან/და სანიტარიულ-ჰიგიენური მდგომარეობის რისკის არსებობისას კომპანიას უფლება აქვს შეაჩეროს აღნიშნული ავტომობილის გამოყენება კომპანიის შეკვეთებისთვის.

3.5. კანონმდებლობით გათვალისწინებული წესის შესაბამისად, ავტომობილის საქარე მინაზე უნდა განთავსდეს აბრა წარწერით — „დაკვეთით“.

3.6. ავტობუსის შემთხვევაში, ავტომობილი აღჭურვილი უნდა იყოს ავარიული გასასვლელების მაჩვენებელი ნიშნებითა და მინის გასატეხი ჩაქუჩით, ცეცხლსაქრობით, გამაფრთხილებელი სამკუთხედით, პირველადი დახმარების სამედიცინო სააფთიაქო ყუთით.

## მუხლი 4. შეკვეთის მიღება და შესრულება

4.1. კომპანია პარტნიორ მძღოლს აწვდის შეკვეთის შესახებ ინფორმაციას კომპანიის სისტემის, მძღოლის პორტალის, ტელეფონის, WhatsApp-ის ან სხვა შეთანხმებული არხის საშუალებით.

4.2. მძღოლი შეკვეთას იღებს ან უარყოფს მისი რეალური ხელმისაწვდომობის შესაბამისად.

4.3. დადასტურებული შეკვეთის მიღების შემდეგ პარტნიორი მძღოლი ვალდებულია გამოცხადდეს მითითებულ დროსა და ადგილზე, შეასრულოს კომპანიასთან შეთანხმებული მარშრუტი, დაიცვას საგზაო მოძრაობის წესები და დროულად აცნობოს კომპანიას შეფერხების, ავარიის, ტექნიკური პრობლემის ან სხვა საგანგებო გარემოების შესახებ.

4.4. დადასტურებული შეკვეთის სხვა პირზე გადაცემა დაუშვებელია კომპანიის წინასწარი წერილობითი თანხმობის გარეშე.

## მუხლი 5. დამოუკიდებელი შეკვეთები

5.1. კომპანიის მიერ წინამდებარე ხელშეკრულების წესის მიხედვით დადასტურებული შეკვეთის გარდა, მძღოლსა და მომხმარებელს შორის დამოუკიდებლად შეთანხმებულ მომსახურებაზე კომპანია არ არის პასუხისმგებელი.

5.2. კომპანიის მომხმარებლისთვის კომპანიის სისტემის გვერდის ავლით მომსახურების შეთავაზება ან კომპანიის სახელით დაუდასტურებელი შეკვეთის შესრულება წარმოადგენს ხელშეკრულების დარღვევას.

5.3. დარღვევის შემთხვევაში კომპანიას უფლება აქვს გამოიყენოს გაფრთხილება, კონკრეტული შეკვეთების შეჩერება, დროებითი დეაქტივაცია ან განმეორებითი/მძიმე დარღვევის შემთხვევაში ხელშეკრულების შეწყვეტა, კანონით დასაშვებ ფარგლებში.

## მუხლი 6. ანაზღაურება და ანგარიშსწორების წესი

6.1. თითოეული შეკვეთის ღირებულება განისაზღვრება კომპანიის სისტემაში ან შეთანხმებულ კომერციულ პირობებში.

6.2. თითოეული შეკვეთიდან კომპანიის საკომისიო შეადგენს {{COMMISSION_PERCENT}}%-ს, ხოლო მძღოლის წილი — {{DRIVER_SHARE_PERCENT}}%-ს.

6.3. კონკრეტულ სეგმენტზე განსხვავებული საკომისიო წინასწარ უნდა იყოს მითითებული შესაბამის შეთავაზებაში ან შეკვეთის პირობებში.

6.4. მხარეებს შეუძლიათ შეცვალონ საკომისიოს ოდენობა, თუ კონკრეტული კომერციული პირობებით სხვა რამ არ არის შეთანხმებული.

6.5. ანგარიშსწორება ხორციელდება {{SETTLEMENT_PERIOD}}, უნაღდო/ნაღდი ანგარიშსწორების გზით, წინამდებარე ხელშეკრულების 2.1.7. მუხლით გათვალისწინებულ, პარტნიორი მძღოლის მიერ წარმოდგენილ საბანკო/საგადახდო რეკვიზიტებზე ჩარიცხვის გზით.

6.6. მძღოლს არ აქვს უფლება, მომხმარებლისგან მოითხოვოს დამატებითი თანხა, გარდა კომპანიის მიერ წინასწარ განსაზღვრული დამატებითი მომსახურებისა.

## მუხლი 7. პარტნიორი მძღოლის ძირითადი ვალდებულებები

7.1. დაიცვას საქართველოს კანონმდებლობა და საგზაო მოძრაობის წესები.

7.2. არ მართოს ავტომობილი ალკოჰოლის, ნარკოტიკული ან სხვა მართვის უნარზე მოქმედი ნივთიერების ზემოქმედების ქვეშ.

7.3. არ გადააჭარბოს ავტომობილის ტექნიკური მახასიათებლებით დაშვებულ მგზავრთა რაოდენობას.

7.4. მგზავრების მიმართ იყოს თავაზიანი, კორექტული და პროფესიონალური.

7.5. არ გამოიყენოს მგზავრის პერსონალური ინფორმაცია პირადი მიზნებისთვის.

7.6. მძღოლი ვალდებულია წინასწარ აცნობოს კომპანიას, თუ ვერ ასწრებს შეკვეთაზე დროულად მისვლას.

## მუხლი 8. კომპანიის ვალდებულებები

8.1. მძღოლს მიაწოდოს შეკვეთისთვის აუცილებელი ინფორმაცია.

8.2. მართოს შეკვეთების განაწილება კომპანიის სისტემის შესაბამისად.

8.3. განახორციელოს მომსახურების ხარისხის მონიტორინგი.

8.4. შეთანხმებული პირობების შესაბამისად უზრუნველყოს მძღოლისთვის შესაბამისი ანაზღაურების გადახდა, წინამდებარე ხელშეკრულებით გათვალისწინებული ანგარიშსწორების წესის შესაბამისად.

## მუხლი 9. მგზავრების უსაფრთხოება

9.1. მძღოლი ვალდებულია განსაკუთრებული ყურადღება გამოიჩინოს ბავშვების, ხანდაზმული პირების, შეზღუდული შესაძლებლობის მქონე პირებისა და სხვა მოწყვლადი მგზავრების გადაყვანისას.

9.2. ბავშვთა გადაყვანისას მძღოლი ვალდებულია დაიცვას კანონით დადგენილი სპეციალური მოთხოვნები.

9.3. ბავშვთა ჯგუფური გადაყვანისას მძღოლი ვალდებულია დაიცვას შესაბამისი სპეციალური მოთხოვნები.

## მუხლი 10. ავარია და საგანგებო შემთხვევა

10.1. ავარიის, პარტნიორი მძღოლის ან/და მგზავრების ჯანმრთელობის გაუარესების, ტექნიკური გაუმართაობის ან/და სხვა საგანგებო შემთხვევისას მძღოლი პირველ რიგში მოქმედებს მგზავრების უსაფრთხოების უზრუნველსაყოფად.

10.2. საჭიროების შემთხვევაში მძღოლი დაუყოვნებლივ უკავშირდება შესაბამის საგანგებო სამსახურს და კომპანიას.

10.3. მძღოლი ვალდებულია კომპანიას მიაწოდოს სრული ინფორმაცია შემთხვევის შესახებ.

## მუხლი 11. პასუხისმგებლობა

11.1. თითოეული მხარე პასუხისმგებელია მის მიერ კანონითა და ამ ხელშეკრულებით დაკისრებული ვალდებულებების დარღვევაზე.

11.2. მძღოლის მიერ საგზაო მოძრაობის წესების, მოქმედი კანონმდებლობის ან უსაფრთხოების მოთხოვნების დარღვევით გამოწვეული პასუხისმგებლობა ეკისრება მძღოლს კანონით დასაშვებ ფარგლებში.

11.3. მგზავრისთვის მიყენებული ზიანისთვის, ასევე მისი ბარგის დაზიანების ან/და დაკარგვისათვის, პასუხისმგებლობა ეკისრება პარტნიორ მძღოლს, გარდა იმ შემთხვევისა, თუკი ზიანი გამოწვეულია დაუძლეველი ძალის ან თვით მგზავრის მიერ, ან/და მისი ბარგით.

11.4. პარტნიორი მძღოლი პასუხისმგებელია ავტომობილის ტექნიკურ გაუმართაობაზე.

11.5. პარტნიორი მძღოლი პასუხისმგებელია საქართველოს კანონმდებლობით აკრძალული საგნების გადაზიდვაზე.

11.6. არც ერთი დებულება არ უნდა განიმარტოს ისე, რომ გამოირიცხოს ან შეიზღუდოს მგზავრის უფლებები და კანონით დადგენილი სავალდებულო პასუხისმგებლობა.

11.7. პარტნიორი მძღოლის მიერ სისტემატური დაგვიანება, გაუქმება, მომხმარებლის პრეტენზიები ან/და უსაფრთხოების წესების დარღვევა შეიძლება გახდეს მძღოლის სტატუსის გადახედვის ან თანამშრომლობის შეწყვეტის საფუძველი.

## მუხლი 12. კონფიდენციალურობა და პერსონალური მონაცემები

12.1. პარტნიორი მძღოლი ვალდებულია დაიცვას მომხმარებლების, პარტნიორებისა და კომპანიის კონფიდენციალური ინფორმაცია.

12.2. მგზავრის ტელეფონის ნომერი, მისამართი, მარშრუტი, სასტუმრო, სამუშაო ადგილი ან სხვა პირადი ინფორმაცია არ შეიძლება იქნეს გამოყენებული მომსახურების ფარგლებს გარეთ.

12.3. პარტნიორი მძღოლი ვალდებულია დაიცვას პერსონალური მონაცემების შესახებ საქართველოს კანონმდებლობის მოთხოვნები.

## მუხლი 13. ხელშეკრულების მოქმედება და შეწყვეტა

13.1. ხელშეკრულება ძალაში შედის ხელმოწერის დღიდან და იდება უვადოდ.

13.2. თითოეულ მხარეს შეუძლია ხელშეკრულების შეწყვეტა მეორე მხარისთვის {{TERMINATION_NOTICE_DAYS}} დღით ადრე წერილობითი შეტყობინებით.

13.3. მძიმე დარღვევის, უსაფრთხოების რისკის, თაღლითობის ან განმეორებითი არსებითი დარღვევის შემთხვევაში კომპანიას უფლება აქვს შეწყვიტოს თანამშრომლობა დაუყოვნებლივ, კანონით დასაშვებ ფარგლებში.

## მუხლი 14. დავების გადაწყვეტა

14.1. მხარეები ცდილობენ ყველა დავა პირველ რიგში მოლაპარაკებით მოაგვარონ.

14.2. შეთანხმების მიუღწევლობის შემთხვევაში დავა განიხილება საქართველოს მოქმედი კანონმდებლობის შესაბამისად.

## მუხლი 15. საბოლოო დებულებები

15.1. ხელშეკრულებაში ცვლილება ძალაში შედის მხარეთა წერილობითი შეთანხმებით.

15.2. ხელშეკრულების დანართები წარმოადგენს მის განუყოფელ ნაწილს.

15.3. თუ რომელიმე დებულება ბათილი ან აღუსრულებელი გახდება, ეს არ იწვევს ხელშეკრულების სხვა დებულებების ავტომატურ ბათილობას.

## მხარეთა რეკვიზიტები

კომპანია: {{COMPANY_LEGAL_NAME}}, ს/კ {{COMPANY_ID_NUMBER}}, მისამართი: {{COMPANY_ADDRESS}}, დირექტორი: {{COMPANY_DIRECTOR}}, ელექტრონული ფოსტა: {{SUPPORT_EMAIL}}.

პარტნიორი მძღოლი: {{DRIVER_NAME}}, პირადი ნომერი: {{DRIVER_PERSONAL_NUMBER}}, ტელეფონი: {{DRIVER_PHONE}}, მისამართი: {{DRIVER_ADDRESS}}.

პარტნიორი მძღოლის ხელმოწერა ხორციელდება ელექტრონულად, მძღოლის პორტალში სახელისა და გვარის აკრეფითა და დადასტურებით. ხელმოწერის მომენტში ფიქსირდება ხელმოწერის თარიღი, დრო და წინამდებარე ტექსტის უცვლელობის დამადასტურებელი კრიპტოგრაფიული ანაბეჭდი.
$contract_ka$, false);

-- The same instrument in English. The Georgian text governs; this exists so a
-- driver who reads the console in English or Russian is not asked to sign
-- something they cannot read. Article numbering matches the Georgian exactly.
INSERT INTO contract_versions (party_type, version, locale, title, body, published) VALUES
('DRIVER', '2026-08-v2', 'en', 'Driver partnership and transport services agreement', $contract_en$
Tbilisi. This agreement is concluded electronically and enters into force at the moment the partner driver signs it electronically.

Between {{COMPANY_LEGAL_NAME}}, identification number {{COMPANY_ID_NUMBER}}, represented by its director {{COMPANY_DIRECTOR}} (the "Company"), and {{DRIVER_NAME}}, personal number {{DRIVER_PERSONAL_NUMBER}}, telephone {{DRIVER_PHONE}}, address {{DRIVER_ADDRESS}} (the "Partner Driver"), together the "Parties".

This is a translation provided for convenience. The Georgian text of this agreement governs, and prevails in the event of any discrepancy.

## Article 1. Subject of the agreement

1.1. The Company organises passenger transfers, intercity journeys, tourist, family, group, corporate and other transport services through its digital platform and its network of partner drivers.

1.2. The Partner Driver joins the Company's partner network and carries passengers on the basis of orders received from and confirmed by the Company.

1.3. This agreement constitutes a partnership and services relationship and does not of itself create an employment relationship, unless a separate written employment contract exists between the Parties.

1.4. The Partner Driver independently manages their own availability, working schedule, and which orders they agree to perform.

## Article 2. Documentation to be submitted by the Partner Driver

2.1. The Partner Driver is obliged to submit to the Company:

2.1.1. a valid identity document;

2.1.2. a valid driving licence of the appropriate category;

2.1.3. the vehicle registration and the documents required by law;

2.1.4. on request, the document issued by the LEPL Service Agency of the Ministry of Internal Affairs confirming the penalty points recorded against the driving licence;

2.1.5. where three or more route directions remain unchanged within one calendar week, the appropriate permit issued by the LEPL Land Transport Agency of the Ministry of Economy and Sustainable Development of Georgia and/or the relevant administrative body;

2.1.6. proof of insurance, where such insurance exists;

2.1.7. banking and payment details, and such other information as the Company requests.

2.2. The Partner Driver confirms that the information submitted is complete, accurate and current.

2.3. The Partner Driver is obliged to notify the Company without delay of the expiry, suspension, cancellation or other material change of any document.

## Article 3. The vehicle

3.1. The driver uses only a vehicle registered with and approved by the Company.

3.2. The technical and sanitary-hygienic condition of the vehicle must comply with the applicable road traffic rules, the manufacturer's instructions, the applicable standards, these rules, and the requirements established for them by the legislation of Georgia.

3.3. For the purpose of verifying the technical and sanitary-hygienic condition referred to in clause 3.2, the Company is entitled to request periodically photographs of the vehicle, documents, or information confirming its technical condition.

3.4. Where a risk to the technical and/or sanitary-hygienic condition exists, the Company is entitled to suspend the use of that vehicle for Company orders.

3.5. In accordance with the procedure established by law, a sign reading "დაკვეთით" (by order) must be displayed on the vehicle's windscreen.

3.6. In the case of a bus, the vehicle must be equipped with emergency exit signs and a glass-breaking hammer, a fire extinguisher, a warning triangle, and a first aid kit.

## Article 4. Receiving and performing an order

4.1. The Company provides the Partner Driver with order information through the Company's system, the driver portal, telephone, WhatsApp, or another agreed channel.

4.2. The driver accepts or declines an order according to their actual availability.

4.3. Having accepted a confirmed order, the Partner Driver is obliged to attend at the stated time and place, perform the route agreed with the Company, observe the road traffic rules, and notify the Company promptly of any delay, accident, technical problem or other emergency circumstance.

4.4. A confirmed order may not be transferred to another person without the Company's prior written consent.

## Article 5. Independent orders

5.1. Save for orders confirmed by the Company under this agreement, the Company is not responsible for services agreed independently between the driver and a customer.

5.2. Offering services to a Company customer while bypassing the Company's system, or performing an unconfirmed order in the Company's name, constitutes a breach of this agreement.

5.3. In the event of a breach the Company is entitled to issue a warning, suspend particular orders, temporarily deactivate the driver, or — in the case of a repeated or serious breach — terminate this agreement, to the extent permitted by law.

## Article 6. Remuneration and settlement

6.1. The price of each order is determined in the Company's system or in the agreed commercial terms.

6.2. The Company's commission on each order is {{COMMISSION_PERCENT}}%, and the driver's share is {{DRIVER_SHARE_PERCENT}}%.

6.3. A different commission for a particular segment must be stated in advance in the relevant offer or order terms.

6.4. The Parties may vary the commission, unless otherwise agreed in specific commercial terms.

6.5. Settlement is made {{SETTLEMENT_PERIOD}}, by cashless or cash settlement, by transfer to the banking and payment details submitted by the Partner Driver under clause 2.1.7 of this agreement.

6.6. The driver is not entitled to demand any additional sum from a customer, other than for additional services determined in advance by the Company.

## Article 7. Principal obligations of the Partner Driver

7.1. To observe the legislation of Georgia and the road traffic rules.

7.2. Not to drive under the influence of alcohol, narcotics or any other substance affecting the ability to drive.

7.3. Not to exceed the number of passengers permitted by the vehicle's technical specification.

7.4. To be courteous, correct and professional towards passengers.

7.5. Not to use a passenger's personal information for private purposes.

7.6. To notify the Company in advance if they will not reach an order on time.

## Article 8. Obligations of the Company

8.1. To provide the driver with the information necessary for the order.

8.2. To manage the distribution of orders in accordance with the Company's system.

8.3. To monitor the quality of the service.

8.4. To ensure payment of the driver's remuneration in accordance with the agreed terms and the settlement procedure set out in this agreement.

## Article 9. Passenger safety

9.1. The driver is obliged to exercise particular care when carrying children, elderly persons, persons with disabilities and other vulnerable passengers.

9.2. When carrying children the driver is obliged to observe the special requirements established by law.

9.3. When carrying groups of children the driver is obliged to observe the applicable special requirements.

## Article 10. Accidents and emergencies

10.1. In the event of an accident, a deterioration in the health of the Partner Driver and/or passengers, a technical failure, and/or any other emergency, the driver acts first to secure the safety of the passengers.

10.2. Where necessary the driver contacts the relevant emergency service and the Company without delay.

10.3. The driver is obliged to provide the Company with full information about the incident.

## Article 11. Liability

11.1. Each Party is liable for its breach of the obligations imposed on it by law and by this agreement.

11.2. Liability arising from the driver's breach of the road traffic rules, applicable legislation or safety requirements rests with the driver, to the extent permitted by law.

11.3. Liability for harm caused to a passenger, and for damage to and/or loss of their luggage, rests with the Partner Driver, except where the harm is caused by force majeure or by the passenger themselves and/or their luggage.

11.4. The Partner Driver is liable for the technical condition of the vehicle.

11.5. The Partner Driver is liable for the carriage of items prohibited by the legislation of Georgia.

11.6. No provision of this agreement shall be construed so as to exclude or limit a passenger's rights or any mandatory liability established by law.

11.7. Systematic lateness, cancellation, customer complaints and/or breaches of safety rules by the Partner Driver may give grounds for reviewing the driver's status or ending the cooperation.

## Article 12. Confidentiality and personal data

12.1. The Partner Driver is obliged to protect the confidential information of customers, partners and the Company.

12.2. A passenger's telephone number, address, route, hotel, place of work or other personal information may not be used outside the scope of the service.

12.3. The Partner Driver is obliged to observe the requirements of the legislation of Georgia on personal data protection.

## Article 13. Duration and termination

13.1. This agreement enters into force on the day of signature and is concluded for an indefinite term.

13.2. Either Party may terminate this agreement by giving the other Party {{TERMINATION_NOTICE_DAYS}} days' written notice.

13.3. In the event of a serious breach, a safety risk, fraud, or a repeated material breach, the Company is entitled to end the cooperation immediately, to the extent permitted by law.

## Article 14. Dispute resolution

14.1. The Parties shall first seek to resolve any dispute by negotiation.

14.2. Failing agreement, the dispute shall be determined in accordance with the applicable legislation of Georgia.

## Article 15. Final provisions

15.1. Amendments to this agreement take effect upon written agreement of the Parties.

15.2. The annexes to this agreement form an integral part of it.

15.3. If any provision becomes void or unenforceable, this does not automatically render the other provisions void.

## Details of the Parties

Company: {{COMPANY_LEGAL_NAME}}, identification number {{COMPANY_ID_NUMBER}}, address: {{COMPANY_ADDRESS}}, director: {{COMPANY_DIRECTOR}}, email: {{SUPPORT_EMAIL}}.

Partner Driver: {{DRIVER_NAME}}, personal number: {{DRIVER_PERSONAL_NUMBER}}, telephone: {{DRIVER_PHONE}}, address: {{DRIVER_ADDRESS}}.

The Partner Driver signs electronically, by typing their first and last name in the driver portal and confirming. The date and time of signature, and a cryptographic digest proving this text was not altered, are recorded at the moment of signing.
$contract_en$, false);

-- =========================================================================
-- The school agreement, version 1. Georgian governs.
--
-- Two departures from the drafted text, both to avoid a blank in a signed
-- instrument:
--
--   * Clause 9.4 offered a choice of prepayment splits to be ticked by hand.
--     Since every trip is already priced on its own order sheet, and the
--     sheet records what was prepaid, the clause now points at the sheet.
--   * The cancellation percentages in 11.2 are placeholders resolved from
--     settings, so the ladder can be tuned without reissuing the agreement.
-- =========================================================================
INSERT INTO contract_versions (party_type, version, locale, title, body, published) VALUES
('SCHOOL', '2026-08-v1', 'ka', 'სატრანსპორტო მომსახურებისა და სასკოლო ექსკურსიის ორგანიზების ხელშეკრულება', $school_ka$
ქ. თბილისი. თარიღი: ხელმოწერის დღე.

ერთი მხრივ, {{COMPANY_LEGAL_NAME}}, ს/კ {{COMPANY_ID_NUMBER}}, წარმოდგენილი დირექტორის {{COMPANY_DIRECTOR}} მიერ, შემდგომში — „მომსახურების მიმწოდებელი“, და მეორე მხრივ, {{SCHOOL_NAME}}, ს/კ {{SCHOOL_ID_NUMBER}}, წარმოდგენილი {{SCHOOL_DIRECTOR}} მიერ, შემდგომში — „სკოლა“, ერთობლივად — „მხარეები“, ვდებთ წინამდებარე ხელშეკრულებას.

## მუხლი 1. ხელშეკრულების საგანი

1.1. მომსახურების მიმწოდებელი სკოლის შეკვეთების საფუძველზე უზრუნველყოფს მოსწავლეების, მასწავლებლებისა და სხვა უფლებამოსილი პირების ორგანიზებულ სატრანსპორტო მომსახურებას.

1.2. მომსახურება შეიძლება მოიცავდეს ტრანსპორტის მიწოდებას, მძღოლის მომსახურებას, შეთანხმებული მარშრუტის შესრულებას, მგზავრთა ჩასხდომა-გადმოსხდომის ორგანიზაციულ მხარდაჭერას და საჭიროების შემთხვევაში დამატებითი უსაფრთხოების კოორდინატორის მომსახურებას.

1.3. თითოეული კონკრეტული ექსკურსია/გადაადგილება ფორმდება შეკვეთის/მარშრუტის ფურცლით, რომელიც წარმოადგენს ამ ხელშეკრულების დანართს.

## მუხლი 2. შეკვეთის სავალდებულო ინფორმაცია

2.1. სკოლა შეკვეთისას აწვდის გასვლის თარიღს, შეკრების ადგილს, დანიშნულების ადგილს, მარშრუტს, დროს, მოსწავლეთა და თანმხლები პირების რაოდენობას, სატრანსპორტო საშუალების მოთხოვნას და სხვა აუცილებელ ინფორმაციას.

2.2. საბოლოო მარშრუტი და მომსახურების პირობები უნდა შეთანხმდეს გამგზავრებამდე გონივრულ ვადაში.

## მუხლი 3. მომსახურების მიმწოდებლის ვალდებულებები

3.1. უზრუნველყოს შეთანხმებული კატეგორიისა და ტევადობის სატრანსპორტო საშუალება.

3.2. უზრუნველყოს შესაბამისი უფლებამოსილების მქონე მძღოლი.

3.3. უზრუნველყოს ავტომობილის ტექნიკური და ვიზუალური მდგომარეობის შესაბამისობა უსაფრთხო მგზავრობისთვის.

3.4. უზრუნველყოს შეთანხმებულ დროსა და ადგილზე ტრანსპორტის გამოცხადება.

3.5. დაიცვას საქართველოს კანონმდებლობით დადგენილი მოთხოვნები ბავშვთა გადაყვანის შესახებ.

## მუხლი 4. სკოლის ვალდებულებები

4.1. სკოლა აწვდის ზუსტ ინფორმაციას მგზავრთა რაოდენობისა და მარშრუტის შესახებ.

4.2. სკოლა ნიშნავს პასუხისმგებელ სრულწლოვან პირს, რომელიც ექსკურსიის/მგზავრობის განმავლობაში წარმოადგენს სკოლას.

4.3. სკოლა უზრუნველყოფს მოსწავლეების ორგანიზებულად გამოცხადებას ჩასხდომის ადგილზე.

4.4. სკოლა უზრუნველყოფს მოსწავლეების ქცევის, დისციპლინისა და ორგანიზების კონტროლს სკოლის პასუხისმგებელი პირების ფუნქციების ფარგლებში.

4.5. სკოლა დროულად აცნობებს მომსახურების მიმწოდებელს ბავშვის ჯანმრთელობის, გადაადგილების ან სხვა განსაკუთრებული საჭიროების შესახებ, თუ ასეთი ინფორმაცია აუცილებელია უსაფრთხო მომსახურებისთვის.

## მუხლი 5. ბავშვთა უსაფრთხოება

5.1. ბავშვთა უსაფრთხოება არის მომსახურების უმთავრესი პრიორიტეტი.

5.2. ბავშვების გადაყვანა ხორციელდება მოქმედი კანონმდებლობის შესაბამისად.

5.3. ბავშვების გადაყვანისას დაუშვებელია მათი დგომით მგზავრობა.

5.4. სპეციალური კანონით დადგენილი მოთხოვნების არსებობის შემთხვევაში მხარეები ვალდებულნი არიან დაიცვან შესაბამისი მოთხოვნები.

5.5. ბავშვების ჩასხდომისა და გადმოსხდომისას პასუხისმგებელი სრულწლოვანი პირები და მძღოლი მოქმედებენ თავიანთი ფუნქციების შესაბამისად.

## მუხლი 6. უსაფრთხოების კოორდინატორი

6.1. სკოლის მოთხოვნის შემთხვევაში შესაძლებელია დამატებით გამოყენებულ იქნეს უსაფრთხოების კოორდინატორი (Safety Coordinator).

6.2. მისი ფუნქცია შეიძლება მოიცავდეს ბავშვების გადაადგილების ორგანიზებაში დახმარებას, ჯგუფის შეკრების მხარდაჭერას, ჩამორჩენის/დაკარგვის რისკის პრევენციას, საგანგებო სიტუაციაში ორგანიზაციულ მხარდაჭერას და სკოლის პასუხისმგებელ პირთან კოორდინაციას.

6.3. უსაფრთხოების კოორდინატორი არ ცვლის მასწავლებელს, სკოლის ადმინისტრაციას, ბავშვის კანონიერ წარმომადგენელს ან სხვა კანონით განსაზღვრულ პასუხისმგებელ პირს.

6.4. მომსახურების ღირებულება განისაზღვრება კონკრეტული შეკვეთით.

## მუხლი 7. ტრანსპორტის პაკეტები

7.1. STANDARD — ტრანსპორტი + მძღოლი + შეთანხმებული მარშრუტი.

7.2. PLUS — STANDARD + უსაფრთხოების კოორდინატორი.

7.3. PREMIUM — STANDARD + უსაფრთხოების კოორდინატორი + დამატებითი ორგანიზაციული მხარდაჭერა.

7.4. კონკრეტული ავტომობილის ტიპი და რაოდენობა განისაზღვრება მგზავრთა რაოდენობის შესაბამისად.

## მუხლი 8. მშობლების ინფორმირება

8.1. დამატებითი მომსახურების სახით შეიძლება განხორციელდეს ინფორმაციის მიწოდება: ჯგუფი გავიდა სკოლიდან; მივიდა დანიშნულების ადგილზე; დატოვა დანიშნულების ადგილი; დაბრუნდა ქალაქში/სკოლაში.

8.2. მგზავრობის რეალურ დროში თვალყურის დევნება (Live Trip Tracking) გამოიყენება მხოლოდ შესაბამისი ტექნიკური, სამართლებრივი და მონაცემთა დაცვის მოთხოვნების გათვალისწინებით.

## მუხლი 9. ფასი და ანგარიშსწორება

9.1. კონკრეტული მომსახურების ღირებულება განისაზღვრება თითოეული შეკვეთის/დანართის მიხედვით.

9.2. ფასში შედის მხოლოდ წინასწარ შეთანხმებული მომსახურებები.

9.3. დამატებითი ხარჯები საჭიროებს წინასწარ შეთანხმებას, გარდა საგანგებო აუცილებლობის შემთხვევებისა.

9.4. ანგარიშსწორების პირობები, მათ შორის წინასწარი გადახდის ოდენობა, განისაზღვრება თითოეული შეკვეთის ფურცლით, რომელიც წარმოადგენს ამ ხელშეკრულების განუყოფელ ნაწილს.

## მუხლი 10. მარშრუტის ცვლილება და გაჩერებები

10.1. მარშრუტის მნიშვნელოვანი ცვლილება უნდა შეთანხმდეს მომსახურების მიმწოდებელთან.

10.2. მძღოლს უფლება აქვს უარი თქვას ისეთ გაჩერებაზე ან მარშრუტის მონაკვეთზე, რომელიც ქმნის მგზავრების უსაფრთხოების რისკს.

10.3. გზის ჩაკეტვის, ავარიის, ამინდის ან სხვა ობიექტური მიზეზის შემთხვევაში მხარეები თანამშრომლობენ უსაფრთხო ალტერნატივის შესარჩევად.

## მუხლი 11. გაუქმება

11.1. კონკრეტული შეკვეთის გაუქმების პირობები განისაზღვრება შეკვეთის პირობებით.

11.2. გაუქმების პოლიტიკა: მომსახურებამდე {{CANCEL_FREE_HOURS}} საათზე ადრე — ჯარიმის გარეშე; {{CANCEL_FREE_HOURS}}–24 საათით ადრე — წინასწარი თანხის {{CANCEL_TIER_A}}%; 24 საათზე ნაკლები — {{CANCEL_TIER_B}}%; მომსახურების დღეს — {{CANCEL_TIER_C}}%, გარდა დასაბუთებული ფორსმაჟორისა.

## მუხლი 12. პასუხისმგებლობა

12.1. თითოეული მხარე პასუხისმგებელია მის მიერ ხელშეკრულებითა და მოქმედი კანონმდებლობით დაკისრებული ვალდებულებების დარღვევაზე.

12.2. მომსახურების მიმწოდებელი პასუხისმგებელია სატრანსპორტო მომსახურების სათანადო შესრულებაზე კანონით დადგენილ ფარგლებში.

12.3. სკოლა პასუხისმგებელია იმ საკითხებზე, რომლებიც დაკავშირებულია მოსწავლეების ორგანიზებასთან, მათზე ზედამხედველობასთან და სკოლის მიერ დანიშნული პასუხისმგებელი პირების მოვალეობებთან.

12.4. არც ერთი დებულება არ ათავისუფლებს მომსახურების მიმწოდებელს კანონით დადგენილი პასუხისმგებლობისგან მგზავრისთვის მიყენებული ზიანის შემთხვევაში.

## მუხლი 13. დაზღვევა

13.1. მომსახურების მიმწოდებელი უზრუნველყოფს კანონით მოთხოვნილი და/ან მხარეთა მიერ შეთანხმებული შესაბამისი დაზღვევის არსებობას.

13.2. კონკრეტული დაზღვევის ტიპი, ლიმიტი და მოქმედების პირობები შეიძლება განისაზღვროს შესაბამის დანართში.

13.3. სკოლას უფლება აქვს მომსახურების დაწყებამდე მოითხოვოს შესაბამისი დაზღვევის დამადასტურებელი დოკუმენტი, თუ ეს წინასწარ არის შეთანხმებული.

## მუხლი 14. პერსონალური მონაცემები

14.1. მხარეები ვალდებულნი არიან დაიცვან პერსონალური მონაცემების დაცვის შესახებ საქართველოს კანონმდებლობა.

14.2. ბავშვებთან დაკავშირებული მონაცემები მუშავდება მხოლოდ იმ მოცულობით, რაც აუცილებელია კონკრეტული მომსახურების ორგანიზებისა და უსაფრთხოებისთვის.

14.3. ბავშვის სახელი, ტელეფონი, ჯანმრთელობის შესახებ ინფორმაცია, მშობლის საკონტაქტო ინფორმაცია ან სხვა პირადი მონაცემები არ უნდა იქნეს გამოყენებული მომსახურების მიზნის ფარგლებს გარეთ.

14.4. ფოტო/ვიდეო მასალის კომერციული ან მარკეტინგული გამოყენება ხორციელდება მხოლოდ შესაბამისი სამართლებრივი საფუძვლის არსებობის შემთხვევაში.

## მუხლი 15. ფორსმაჟორი

15.1. ფორსმაჟორად შეიძლება ჩაითვალოს ისეთი გარემოება, რომლის კონტროლი მხარეებს გონივრულად არ შეუძლიათ, მათ შორის სტიქიური მოვლენა, გზის მასშტაბური ჩაკეტვა, საომარი მდგომარეობა, მასობრივი შეფერხება და სხვა მსგავსი გარემოებები.

15.2. ფორსმაჟორის შემთხვევაში მხარეები პირველ რიგში ცდილობენ მომსახურების უსაფრთხოდ გადადებას ან ალტერნატიული მარშრუტის შეთანხმებას.

## მუხლი 16. ხელშეკრულების მოქმედება და შეწყვეტა

16.1. ხელშეკრულება ძალაში შედის ხელმოწერის დღიდან და მოქმედებს უვადოდ.

16.2. თითოეულ მხარეს შეუძლია ხელშეკრულების შეწყვეტა მეორე მხარისთვის მინიმუმ {{TERMINATION_NOTICE_DAYS}} დღით ადრე წერილობითი შეტყობინებით.

16.3. მძიმე დარღვევის შემთხვევაში დაზარალებულ მხარეს უფლება აქვს მოითხოვოს ხელშეკრულების დაუყოვნებლივ შეწყვეტა კანონით დასაშვებ ფარგლებში.

## მუხლი 17. დავების გადაწყვეტა

17.1. მხარეები ვალდებულნი არიან დავა პირველ რიგში მოლაპარაკების გზით მოაგვარონ.

17.2. შეთანხმების მიუღწევლობის შემთხვევაში დავა განიხილება საქართველოს მოქმედი კანონმდებლობის შესაბამისად.

## მუხლი 18. საბოლოო დებულებები

18.1. ხელშეკრულებაში ცვლილება ძალაში შედის წერილობითი შეთანხმების საფუძველზე.

18.2. თითოეული ექსკურსიის/გადაადგილების შეკვეთის ფორმა, მარშრუტი, ფასი და სპეციალური პირობები ფორმდება ცალკე დანართით (დანართი 1).

18.3. ხელშეკრულების რომელიმე დებულების ბათილობა არ იწვევს დანარჩენი დებულებების ბათილობას.

## დანართი 1 — შეკვეთის ფურცელი

თითოეული ექსკურსია ფორმდება ცალკე შეკვეთის ფურცლით, რომელიც შეიცავს: შეკვეთის ნომერს; სკოლას; თარიღს; შეკრების ადგილსა და დროს; დანიშნულების ადგილს; მარშრუტს; მოსწავლეების რაოდენობას; მასწავლებლების/თანმხლები პირების რაოდენობას; ავტომობილის ტიპს; მძღოლს; პაკეტს (STANDARD / PLUS / PREMIUM); უსაფრთხოების კოორდინატორის მონაწილეობას; მშობლების ინფორმირების მომსახურებას; გასვლისა და დაბრუნების სავარაუდო დროს; სრულ ფასს; წინასწარ გადახდას; დამატებით პირობებს; სკოლის პასუხისმგებელ პირსა და მის ტელეფონს; მომსახურების მიმწოდებლის პასუხისმგებელ პირსა და მის ტელეფონს.

ხელმოწერილი შეკვეთის ფურცელი წარმოადგენს წინამდებარე ხელშეკრულების განუყოფელ ნაწილს.

## მხარეთა რეკვიზიტები და ხელმოწერები

მომსახურების მიმწოდებელი: {{COMPANY_LEGAL_NAME}}, ს/კ {{COMPANY_ID_NUMBER}}, მისამართი: {{COMPANY_ADDRESS}}, დირექტორი: {{COMPANY_DIRECTOR}}, ელექტრონული ფოსტა: {{SUPPORT_EMAIL}}.

სკოლა: {{SCHOOL_NAME}}, ს/კ {{SCHOOL_ID_NUMBER}}, მისამართი: {{SCHOOL_ADDRESS}}, დირექტორი: {{SCHOOL_DIRECTOR}}, ტელეფონი: {{SCHOOL_PHONE}}.

ხელმოწერა: ______________________          ხელმოწერა: ______________________
$school_ka$, false);

INSERT INTO contract_versions (party_type, version, locale, title, body, published) VALUES
('SCHOOL', '2026-08-v1', 'en', 'Transport services and school excursion agreement', $school_en$
Tbilisi. Date: the day of signature.

Between {{COMPANY_LEGAL_NAME}}, identification number {{COMPANY_ID_NUMBER}}, represented by its director {{COMPANY_DIRECTOR}} (the "Service Provider"), and {{SCHOOL_NAME}}, identification number {{SCHOOL_ID_NUMBER}}, represented by {{SCHOOL_DIRECTOR}} (the "School"), together the "Parties".

This is a translation provided for convenience. The Georgian text of this agreement governs, and prevails in the event of any discrepancy.

## Article 1. Subject of the agreement

1.1. On the basis of orders placed by the School, the Service Provider organises transport for pupils, teachers and other authorised persons.

1.2. The service may include the provision of a vehicle, driver services, performance of the agreed route, organisational support for boarding and alighting, and where required the services of an additional Safety Coordinator.

1.3. Each individual excursion or journey is documented by an order and route sheet, which forms an annex to this agreement.

## Article 2. Information required with an order

2.1. When placing an order the School provides the date of departure, the assembly point, the destination, the route, the timing, the number of pupils and accompanying persons, the vehicle required, and any other necessary information.

2.2. The final route and the terms of service must be agreed a reasonable time before departure.

## Article 3. Obligations of the Service Provider

3.1. To provide a vehicle of the agreed category and capacity.

3.2. To provide a driver holding the appropriate authorisation.

3.3. To ensure the technical and visual condition of the vehicle is suitable for safe travel.

3.4. To ensure the vehicle attends at the agreed time and place.

3.5. To observe the requirements established by the legislation of Georgia on the carriage of children.

## Article 4. Obligations of the School

4.1. The School provides accurate information about the number of passengers and the route.

4.2. The School appoints a responsible adult who represents the School throughout the excursion or journey.

4.3. The School ensures that pupils attend the boarding point in an organised manner.

4.4. The School is responsible for the conduct, discipline and organisation of pupils, within the functions of the persons it has made responsible.

4.5. The School notifies the Service Provider in good time of any health, mobility or other special need of a child, where that information is necessary for the service to be performed safely.

## Article 5. Child safety

5.1. The safety of children is the paramount priority of the service.

5.2. Children are carried in accordance with the applicable legislation.

5.3. Children may not travel standing.

5.4. Where special statutory requirements apply, the Parties are obliged to observe them.

5.5. During boarding and alighting the responsible adults and the driver act in accordance with their respective functions.

## Article 6. Safety Coordinator

6.1. At the School's request an additional Safety Coordinator may be engaged.

6.2. Their function may include assisting with the organised movement of children, supporting the assembly of the group, preventing the risk of a child being left behind or lost, providing organisational support in an emergency, and coordinating with the School's responsible person.

6.3. The Safety Coordinator does not replace a teacher, the school administration, a child's legal representative, or any other person made responsible by law.

6.4. The price of this service is determined by the individual order.

## Article 7. Transport packages

7.1. STANDARD — vehicle, driver and the agreed route.

7.2. PLUS — STANDARD plus a Safety Coordinator.

7.3. PREMIUM — STANDARD plus a Safety Coordinator plus additional organisational support.

7.4. The type and number of vehicles is determined by the number of passengers.

## Article 8. Parent updates

8.1. As an additional service, the following may be reported: the group has left the school; it has arrived at the destination; it has left the destination; it has returned to the city or school.

8.2. Live trip tracking is used only where the relevant technical, legal and data protection requirements are satisfied.

## Article 9. Price and settlement

9.1. The price of a particular service is determined by each order and its annex.

9.2. The price covers only the services agreed in advance.

9.3. Additional costs require prior agreement, except in cases of emergency necessity.

9.4. The settlement terms, including the amount payable in advance, are set out in the order sheet for each trip, which forms an integral part of this agreement.

## Article 10. Route changes and stops

10.1. Any material change to the route must be agreed with the Service Provider.

10.2. The driver is entitled to refuse a stop or a section of route that creates a risk to passenger safety.

10.3. In the event of a road closure, an accident, weather or another objective cause, the Parties cooperate to select a safe alternative.

## Article 11. Cancellation

11.1. The conditions for cancelling a particular order are set out in the terms of that order.

11.2. Cancellation policy: more than {{CANCEL_FREE_HOURS}} hours before the service — no charge; between {{CANCEL_FREE_HOURS}} and 24 hours before — {{CANCEL_TIER_A}}% of the prepayment; less than 24 hours — {{CANCEL_TIER_B}}%; on the day of the service — {{CANCEL_TIER_C}}%, save in the case of substantiated force majeure.

## Article 12. Liability

12.1. Each Party is liable for its breach of the obligations imposed on it by this agreement and by applicable legislation.

12.2. The Service Provider is liable for the proper performance of the transport service, to the extent established by law.

12.3. The School is responsible for matters connected with the organisation and supervision of pupils and with the duties of the responsible persons it has appointed.

12.4. No provision releases the Service Provider from the liability established by law in the event of harm caused to a passenger.

## Article 13. Insurance

13.1. The Service Provider maintains the insurance required by law and/or agreed between the Parties.

13.2. The type, limit and terms of a particular insurance may be set out in the relevant annex.

13.3. The School is entitled to request proof of the relevant insurance before the service begins, where this has been agreed in advance.

## Article 14. Personal data

14.1. The Parties are obliged to observe the legislation of Georgia on personal data protection.

14.2. Data relating to children is processed only to the extent necessary to organise the particular service and to keep it safe.

14.3. A child's name, telephone number, health information, a parent's contact details or other personal data may not be used outside the purpose of the service.

14.4. Commercial or marketing use of photographs or video is permitted only where an appropriate legal basis exists.

## Article 15. Force majeure

15.1. Force majeure means a circumstance beyond the Parties' reasonable control, including a natural disaster, a large-scale road closure, a state of war, mass disruption and other similar circumstances.

15.2. In the event of force majeure the Parties shall first seek to postpone the service safely or to agree an alternative route.

## Article 16. Duration and termination

16.1. This agreement enters into force on the day of signature and is concluded for an indefinite term.

16.2. Either Party may terminate this agreement by giving the other Party at least {{TERMINATION_NOTICE_DAYS}} days' written notice.

16.3. In the event of a serious breach, the affected Party is entitled to require immediate termination, to the extent permitted by law.

## Article 17. Dispute resolution

17.1. The Parties are obliged to seek to resolve any dispute by negotiation in the first instance.

17.2. Failing agreement, the dispute shall be determined in accordance with the applicable legislation of Georgia.

## Article 18. Final provisions

18.1. Amendments to this agreement take effect on the basis of a written agreement.

18.2. The order form, route, price and special conditions for each excursion or journey are documented by a separate annex (Annex 1).

18.3. The invalidity of any provision does not render the remaining provisions invalid.

## Annex 1 — order sheet

Each excursion is documented by a separate order sheet containing: the order number; the school; the date; the assembly point and time; the destination; the route; the number of pupils; the number of teachers and accompanying persons; the vehicle type; the driver; the package (STANDARD / PLUS / PREMIUM); whether a Safety Coordinator is engaged; whether parent updates are provided; the departure time and estimated return time; the total price; the prepayment; any additional conditions; the School's responsible person and their telephone number; and the Service Provider's responsible person and their telephone number.

A signed order sheet forms an integral part of this agreement.

## Details of the Parties and signatures

Service Provider: {{COMPANY_LEGAL_NAME}}, identification number {{COMPANY_ID_NUMBER}}, address: {{COMPANY_ADDRESS}}, director: {{COMPANY_DIRECTOR}}, email: {{SUPPORT_EMAIL}}.

School: {{SCHOOL_NAME}}, identification number {{SCHOOL_ID_NUMBER}}, address: {{SCHOOL_ADDRESS}}, director: {{SCHOOL_DIRECTOR}}, telephone: {{SCHOOL_PHONE}}.

Signature: ______________________          Signature: ______________________
$school_en$, false);

-- ------------------------------------------------------------- changeover --
-- v1 was a plain English draft with no signatures against it. It is retired
-- rather than deleted: the row stays readable so the history of what was once
-- on offer survives, but it is no longer what current_contract_version()
-- returns.
UPDATE contract_versions SET published = false, updated_at = now()
WHERE party_type = 'DRIVER' AND version = '2026-08-v1';

-- Both new agreements go live only if nobody signed the old one. A signature
-- against v1 would mean this migration is running somewhere it was not
-- designed for, and the changeover needs a human decision rather than a
-- silent switch.
DO $publish$
BEGIN
  IF (SELECT count(*) FROM contract_signatures) = 0 THEN
    UPDATE contract_versions SET published = true, effective_from = now(), updated_at = now()
    WHERE (party_type = 'DRIVER' AND version = '2026-08-v2')
       OR (party_type = 'SCHOOL' AND version = '2026-08-v1');
  ELSE
    RAISE NOTICE
      'contract v1 has signatures; v2 seeded but left unpublished for a manual changeover';
  END IF;
END $publish$;
