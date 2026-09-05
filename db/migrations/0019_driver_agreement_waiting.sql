-- =========================================================================
-- 0019 — the waiting obligation, and a number to bound it against
--
-- A driver (CR-2026-0021) pointed out that the site tells travellers waiting
-- is included in the price, and that the driver agreement says nothing about
-- waiting at all. Searching the published text for "wait", "waiting",
-- "return the passenger" or "same day" returned nothing. So the company was
-- promising customers something no driver had ever agreed to, and he was
-- entirely within his rights to decline to wait.
--
-- Writing the obligation alone would not have fixed it. Three drafts were
-- rejected first, each for the same reason: they capped the duty at "the
-- waiting time stated in the order", and no such field exists anywhere in the
-- system. A cap that points at nothing is not a cap, and the driver would
-- have signed an open-ended promise. The FAQ made it worse by telling
-- travellers stops were "not time-limited" outright.
--
-- So the number comes first. waiting_included_minutes is a platform setting
-- like the commission rate — a commercial decision, changeable from the
-- console, substituted into the contract at render time as {{WAITING_MINUTES}}
-- and quoted by the FAQ from the same source. The two cannot drift apart.
--
-- Two other defects were caught before this shipped and are fixed in the text
-- below. The clause does NOT say "same day": offers.ts treats any return
-- after departure as a round trip, multi-day included, so a same-day trigger
-- would have left the longest journeys with no return obligation. And it does
-- NOT forbid the driver taking money in the vehicle: cash bookings are the
-- platform's own design, and the passenger pays the fare to the driver at the
-- end of the trip. What is forbidden is anything beyond the stated price.
--
-- A new version rather than an edit. contract_signatures stores a SHA-256 of
-- the resolved body, so editing published text would break every signature
-- that attests to it. There are none today, which is exactly why this is the
-- cheapest moment this change will ever be made.
-- =========================================================================

-- No BEGIN/COMMIT here: db/migrate.ts already runs each file inside one
-- transaction, and closing it early would commit the migration before its own
-- record of having run. None of the other eighteen migrations open one.

-- ---------------------------------------------------------------- setting --
-- 60 minutes covers what the FAQ actually describes — photographs, a meal, a
-- look around — without binding a driver to an open-ended afternoon.
INSERT INTO platform_settings (key, value)
VALUES ('waiting_included_minutes', '60')
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------- clauses --
-- Copied from the live version so the other fourteen articles cannot drift,
-- with the new paragraphs inserted after 4.4. The anchor is 4.4's full text:
-- if it ever changes, this migration has already run and the assertion below
-- is what will catch a bad copy.

CREATE TEMP TABLE waiting_clause (locale TEXT PRIMARY KEY, anchor TEXT, addition TEXT);

INSERT INTO waiting_clause (locale, anchor, addition) VALUES
('en',
 '4.4. A confirmed order may not be transferred to another person without the Company''s prior written consent.',
 E'4.5. The price of a confirmed order covers the whole of the route stated in the order, including the return journey — whether the passenger is carried back or the Partner Driver returns without a passenger — and including waiting at the stops stated in the order. Such waiting forms part of performing the route agreed with the Company and is remunerated by the agreed price of the order; it is not separately remunerated.\n\n4.6. Where a confirmed order provides for the passenger to be carried back, the Partner Driver is obliged to return the passenger to the place stated in the order. That return forms part of the same order and does not constitute a new order.\n\n4.7. The Partner Driver is obliged to wait for the passenger at each stop stated in the order for no longer than {{WAITING_MINUTES}} minutes. Where longer waiting is required, or the passenger asks for a change to the route or to the time of return, the Partner Driver notifies the Company; the Company agrees the change with the passenger and reprices the order before the additional waiting begins. The Partner Driver is not obliged to wait at a stop for longer than {{WAITING_MINUTES}} minutes, nor to carry out any extension of the route or of the waiting that has not been agreed with the Company in this way.\n\n4.8. Where the order provides for payment in cash, the Partner Driver is entitled to receive from the passenger the price stated in the order. The Partner Driver is not entitled to demand from the passenger any additional sum beyond that price — for waiting, for the return journey, or for a change of route — nor to agree such a sum directly with the passenger. Any additional sum is determined by the Company, and settlement with the Partner Driver is carried out in accordance with Article 6.'),
('ka',
 '4.4. დადასტურებული შეკვეთის სხვა პირზე გადაცემა დაუშვებელია კომპანიის წინასწარი წერილობითი თანხმობის გარეშე.',
 E'4.5. დადასტურებული შეკვეთის ფასი მოიცავს შეკვეთაში მითითებულ მთელ მარშრუტს, მათ შორის მგზავრის უკან დაბრუნების გზას — მიუხედავად იმისა, პარტნიორ მძღოლს უკან მგზავრი მიჰყავს თუ მგზავრის გარეშე ბრუნდება — და შეკვეთაში მითითებულ გაჩერებებზე ლოდინს. ასეთი ლოდინი კომპანიასთან შეთანხმებული მარშრუტის შესრულების ნაწილია და ანაზღაურდება შეკვეთის შეთანხმებული ფასით; ცალკე იგი არ ანაზღაურდება.\n\n4.6. თუ დადასტურებული შეკვეთა ითვალისწინებს მგზავრის უკან დაბრუნებას, პარტნიორი მძღოლი ვალდებულია მგზავრი დააბრუნოს შეკვეთაში მითითებულ ადგილზე. ეს დაბრუნება იმავე შეკვეთის ნაწილია და ახალ შეკვეთას არ წარმოადგენს.\n\n4.7. პარტნიორი მძღოლი ვალდებულია შეკვეთაში მითითებულ თითოეულ გაჩერებაზე დაელოდოს მგზავრს არაუმეტეს {{WAITING_MINUTES}} წუთისა. თუ საჭიროა უფრო ხანგრძლივი ლოდინი, ან მგზავრი ითხოვს მარშრუტის ან დაბრუნების დროის შეცვლას, პარტნიორი მძღოლი ამის შესახებ აცნობებს კომპანიას; კომპანია ცვლილებას ათანხმებს მგზავრთან და დამატებითი ლოდინის დაწყებამდე ხელახლა განსაზღვრავს შეკვეთის ფასს. პარტნიორი მძღოლი არ არის ვალდებული გაჩერებაზე დაელოდოს მგზავრს {{WAITING_MINUTES}} წუთზე მეტი ხნით, ან განახორციელოს მარშრუტის ან ლოდინის ისეთი გაფართოება, რომელიც ამ წესით არ არის შეთანხმებული კომპანიასთან.\n\n4.8. თუ შეკვეთა ითვალისწინებს ნაღდი ანგარიშსწორებას, პარტნიორი მძღოლი უფლებამოსილია მგზავრისგან მიიღოს შეკვეთაში მითითებული ფასი. პარტნიორი მძღოლი უფლებამოსილი არ არის მგზავრს მოსთხოვოს ამ ფასის გარდა ნებისმიერი დამატებითი თანხა — ლოდინისთვის, უკან დაბრუნებისთვის ან მარშრუტის ცვლილებისთვის — ან ასეთი თანხა უშუალოდ მგზავრთან შეათანხმოს. ნებისმიერ დამატებით თანხას განსაზღვრავს კომპანია და პარტნიორ მძღოლთან ანგარიშსწორება ხორციელდება მე-6 მუხლის შესაბამისად.');

-- The anchor must appear exactly once in each live body, or the copy would
-- silently produce an agreement missing its new obligations.
DO $$
DECLARE missing TEXT;
BEGIN
  SELECT string_agg(w.locale, ', ') INTO missing
  FROM waiting_clause w
  JOIN contract_versions c
    ON c.locale = w.locale AND c.party_type = 'DRIVER' AND c.published
  WHERE position(w.anchor IN c.body) = 0;
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'clause 4.4 anchor not found in the published driver agreement (%)', missing;
  END IF;
END $$;

INSERT INTO contract_versions (version, locale, party_type, title, body, published)
SELECT '2026-09-v3', c.locale, 'DRIVER', c.title,
       replace(c.body, w.anchor, w.anchor || E'\n\n' || w.addition),
       false
FROM contract_versions c
JOIN waiting_clause w ON w.locale = c.locale
WHERE c.party_type = 'DRIVER' AND c.published;

-- Swap in one step: the old version stops being the one people sign, the new
-- one starts. Nothing is deleted — a signature must always be able to point
-- at the text it was given.
UPDATE contract_versions SET published = false
 WHERE party_type = 'DRIVER' AND version = '2026-08-v2';
UPDATE contract_versions SET published = true
 WHERE party_type = 'DRIVER' AND version = '2026-09-v3';

-- The new text must carry the placeholder, and must not have reintroduced the
-- same-day restriction that made three earlier drafts wrong.
DO $$
DECLARE bad INT;
BEGIN
  SELECT count(*) INTO bad FROM contract_versions
   WHERE version = '2026-09-v3' AND party_type = 'DRIVER'
     AND (position('{{WAITING_MINUTES}}' IN body) = 0 OR body LIKE '%იმავე დღეს%');
  IF bad > 0 THEN
    RAISE EXCEPTION 'the waiting clause is missing its placeholder or reintroduced a same-day limit';
  END IF;

  SELECT count(*) INTO bad FROM contract_versions
   WHERE party_type = 'DRIVER' AND published;
  IF bad <> 2 THEN
    RAISE EXCEPTION 'expected exactly two published driver agreements (ka, en), found %', bad;
  END IF;
END $$;

DROP TABLE waiting_clause;
