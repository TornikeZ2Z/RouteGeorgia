-- =========================================================================
-- 0010 — the driver agreement, and signing it
--
-- Approval is our decision to work with a driver. The signature is their
-- decision to work with us. Publication now requires both.
--
-- Two things this schema is built to survive:
--
--   1. "Which text did they actually agree to?" A signature stores the
--      SHA-256 of the exact body that was on screen, not a pointer to a row
--      that can later be edited. If the document is revised, every existing
--      signature still proves what it covered.
--
--      The hash is computed in the application, not here: the stored text
--      contains placeholders for the company details and the commission rate,
--      so the bytes a driver actually read are only known after substitution.
--      (Postgres would refuse a generated column for it in any case —
--      convert_to() is stable rather than immutable.)
--   2. "Did anyone change the signature afterwards?" Signatures are
--      append-only at the database level, like the audit log.
-- =========================================================================

-- Versions of the agreement, one row per language. The text lives in the
-- database rather than in code so a lawyer's revision does not need a deploy.
-- Body convention matches content_pages: a line beginning "## " opens a
-- section, blank lines separate paragraphs.
CREATE TABLE contract_versions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version        TEXT NOT NULL,
  locale         TEXT NOT NULL,
  title          TEXT NOT NULL,
  body           TEXT NOT NULL,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  published      BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT contract_versions_locale_ck CHECK (locale IN ('en', 'ka')),
  CONSTRAINT contract_versions_version_locale_uq UNIQUE (version, locale)
);

-- The agreement currently on offer. NULL until one is published, which is why
-- every gate below is written to allow work when there is no live version.
CREATE FUNCTION current_contract_version() RETURNS TEXT
LANGUAGE sql STABLE AS $$
  SELECT version FROM contract_versions
  WHERE published
  ORDER BY effective_from DESC, version DESC
  LIMIT 1
$$;

CREATE TABLE contract_signatures (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id        UUID NOT NULL REFERENCES driver_profiles(id) ON DELETE CASCADE,
  contract_version TEXT NOT NULL,
  -- The language the driver actually read before signing, not their profile
  -- language: it is the text in front of them that they agreed to.
  locale           TEXT NOT NULL,
  -- Typed by the driver. Georgian law treats a deliberate electronic
  -- confirmation as equivalent to a handwritten signature; the typed name is
  -- what makes the act deliberate rather than an accidental click.
  signed_name      TEXT NOT NULL,
  body_hash        TEXT NOT NULL,
  signed_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip               TEXT,
  user_agent       TEXT,
  evidence         JSONB NOT NULL DEFAULT '{}',
  CONSTRAINT contract_signatures_once UNIQUE (driver_id, contract_version),
  CONSTRAINT contract_signatures_name_ck CHECK (length(btrim(signed_name)) >= 3)
);

CREATE INDEX contract_signatures_driver_idx ON contract_signatures (driver_id);

-- Immutable once written. UPDATE only: a signature may still disappear if the
-- driver record it belongs to is deleted, but it can never be altered, and the
-- audit log entry written alongside it survives regardless.
CREATE TRIGGER contract_signatures_no_update
  BEFORE UPDATE ON contract_signatures
  FOR EACH ROW EXECUTE FUNCTION audit_logs_append_only();

-- ------------------------------------------------------------ publish gate --
-- A driver goes live only after signing the agreement currently on offer.
-- Fires on the transition into published, so drivers already live when this
-- migration ran are not retroactively pulled down; the next publish action
-- applies the rule.
CREATE FUNCTION driver_publish_requires_signature() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  live_version TEXT := current_contract_version();
BEGIN
  IF NEW.published AND NOT COALESCE(OLD.published, false) AND live_version IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM contract_signatures s
      WHERE s.driver_id = NEW.id AND s.contract_version = live_version
    ) THEN
      RAISE EXCEPTION
        'driver % cannot be published: the driver agreement (%) is not signed',
        NEW.id, live_version
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER driver_publish_requires_signature_trg
  BEFORE UPDATE OF published ON driver_profiles
  FOR EACH ROW EXECUTE FUNCTION driver_publish_requires_signature();

-- ---------------------------------------------------------------- seed v1 --
-- Version 1 of the agreement, English and Georgian. Left UNPUBLISHED on
-- purpose: the company's legal name, identification number and registered
-- address are still placeholders, and nobody should sign a contract whose
-- counterparty reads "to be completed". Publishing is a deliberate act once
-- those are filled in — see src/lib/contract.ts.
INSERT INTO contract_versions (version, locale, title, body, published) VALUES
('2026-08-v1', 'en', 'RouteGeorgia driver agreement', $contract_en$
This agreement sets out the terms on which you offer transport services to travellers through the RouteGeorgia platform. Please read it before you sign it. If anything in it is unclear, ask us before agreeing — we would rather answer a question now than argue about it later.

## Who this agreement is between

This agreement is between {{COMPANY_LEGAL_NAME}}, a limited liability company registered in Georgia under identification number {{COMPANY_ID_NUMBER}}, with its registered address at {{COMPANY_ADDRESS}} ("RouteGeorgia", "we", "us"), and you, the driver whose application we have approved ("you", "the driver").

It comes into force at the moment you sign it electronically on your driver page, and stays in force until either of us ends it under the section "How this agreement ends".

## What RouteGeorgia is, and what it is not

RouteGeorgia operates an online platform that introduces travellers to independent private drivers in Georgia.

We are an intermediary. We do not own vehicles, we do not employ drivers, and we do not carry passengers. The transport service is provided by you, directly to the traveller, under your own licences and on your own responsibility.

We are not a party to the transport contract between you and the traveller. What we provide is the introduction, the booking, the agreed price, verification of your documents, and support for both sides while a trip is arranged and carried out.

## Words used in this agreement

"Platform" means the RouteGeorgia website and any application we provide, together with your driver account.

"Traveller" means the person or organisation who books a journey through the platform.

"Booking" means a confirmed journey, with a fixed price, a stated route and a stated pickup time.

"Fare" means the price of the journey, set by you within the published limits for your vehicle class and shown to the traveller as a single price for the whole vehicle.

"Commission" means our fee for the service we provide, as set out in Annex 1.

"Your account" means the profile we create for you on the platform, which you reach with your own email address and password.

## How you join the platform

You apply through our public application form, giving us your details, your languages, your vehicle and your documents.

We verify what you have sent: identity, driving licence, vehicle registration and insurance. We may call you to talk about your languages and the routes you know, and we may ask for further documents, including a criminal record certificate and a valid technical inspection certificate.

If we decide to work with you, we approve your application and offer you this agreement. Approval is not publication: your profile becomes visible to travellers only after you have signed this agreement and we have published your profile.

We may decline an application at any stage. We will tell you that we have declined it.

## Your account

Your account is yours alone. Keep your password to yourself, and tell us immediately if you believe anyone else has reached it.

Anything done through your account is treated as done by you, and binds you towards travellers and towards us. That includes accepting bookings.

Keep the information on your account accurate and current. If anything changes — a new phone number, a new vehicle, a renewed licence or insurance policy — update it within two days.

We communicate with you through the platform, by email and by SMS. A message is treated as delivered when we send it to the address or number on your account.

## Prices, bookings and payment

You set your own prices, within the limits we publish for each vehicle class. You choose which days you work. You may decline any booking.

The price is fixed at the moment the traveller books. It does not change afterwards unless the traveller asks for a change to the trip and accepts a revised quote.

When a booking reaches you, confirm or decline it promptly. If you neither confirm nor decline within the time we publish, we may contact you, and if we cannot reach you we will treat the booking as declined and find the traveller another driver.

The traveller pays either in cash to you at the end of the trip, or online by card.

Where the traveller has paid by card, we transfer your share to your bank account within 7 calendar days of the payment, after deducting commission and anything you already owe us.

## Commission

Our commission is the percentage of the fare set out in Annex 1. It is included in the price the traveller sees; there is no separate booking fee charged to them.

Where the traveller pays by card, we deduct commission before transferring your share.

Where the traveller pays you in cash, you keep the whole fare at the time, and the commission is added to your commission balance, which you can see on your earnings page. You settle that balance with us by bank transfer or in our office.

We set a credit limit on that balance. If your unsettled commission passes the limit, cash bookings are paused until you settle. Card bookings continue as normal. We will tell you before this happens.

There is no deposit under this agreement, and no fines. If you owe us commission, you owe us commission — that is the whole of it.

If we change the commission rate, we will tell you and ask you to accept a new version of this agreement. Your existing bookings keep the rate that applied when they were made.

## What you must do

Hold, and keep valid throughout, every licence, permit, registration, insurance policy and certificate that Georgian law requires for carrying passengers for payment. Send us proof whenever we ask.

Keep your vehicle roadworthy, clean and technically inspected as the law requires, with winter tyres and equipment in the season that needs them.

Carry out each booking yourself, in the vehicle on your profile. You may not pass a booking to another driver or another vehicle. If you cannot do a trip, decline it or tell us as early as you can.

Drive lawfully and safely. Never drive under the influence of alcohol, drugs or any substance that affects your driving, and never handle a phone or other device while driving.

Do not smoke in the vehicle, do not carry passengers other than the traveller and the people travelling with them, and do not make stops other than for fuel or at the traveller's request.

Treat travellers with courtesy, and do not discriminate against anyone.

Give accurate information about yourself and your vehicle, on your profile and to travellers.

Keep the arrangements for a booking on the platform. Taking a booking off the platform to avoid commission removes our support and protection from the traveller, and is a serious breach of this agreement.

## Travellers' personal information

You receive a traveller's name, phone number and meeting details so that you can carry out the trip. Use that information for the trip and for nothing else.

Delete it when the trip is complete. Do not keep it, do not add it to your own records, and do not contact the traveller afterwards for any other purpose.

## Ratings and reviews

Travellers may rate you and write about their trip. Your average rating is shown on your profile.

We may set a minimum rating and a minimum level of responsiveness. If yours falls below it, we will tell you and give you a period to improve. If it does not improve, we may pause or end this agreement.

We may disregard a rating or review we believe was left in bad faith.

## You are independent

You are an independent contractor, not our employee. Nothing in this agreement creates employment, partnership or agency between us.

You decide when and how much you work, and you may work for anyone else, including our competitors.

You meet your own costs — fuel, insurance, maintenance, depreciation, phone and internet — and you are responsible for your own taxes and social contributions. We are not your tax agent.

## Responsibility

You are responsible for the journey: for carrying it out safely and lawfully, for the condition of your vehicle, and for any loss or damage caused to a traveller or a third party while you do so.

We are responsible for the service we provide: the platform, the booking, the agreed price, verification of documents and support.

We do not promise any particular number of bookings, any level of income, or that the platform will always be available without interruption.

Nothing in this agreement excludes or limits liability that cannot lawfully be excluded or limited, including liability for death or personal injury caused by negligence.

## Your personal information

We collect and hold your name, date of birth, contact details, identity document, driving licence, vehicle registration, insurance policy, bank details, photographs, ratings, and the records of your trips.

We hold your identity and licence documents in restricted storage, separate from the photographs shown to travellers. Only staff whose role requires it can open them, and every time one is opened it is recorded in a log that cannot be altered or deleted.

Travellers see your public name, photograph, vehicle, languages, rating and reviews. They do not see your documents, your date of birth or your bank details.

We may share your information with the authorities where the law requires it, and with a traveller or an insurer where it is needed to resolve an incident.

We keep your information while your account is active and afterwards for as long as Georgian law requires and any claim could still be brought.

You may ask us for a copy of what we hold about you, ask us to correct it, or ask us to delete it. Write to {{SUPPORT_EMAIL}}. We will keep what the law requires us to keep.

## Confidentiality

Anything you learn about our business through working with us that is not public — how the platform works internally, our commercial terms with others, our plans — keep to yourself, during this agreement and after it ends.

The same applies to us about you.

## Our platform and brand

The platform, its software, design, database, texts, name and logo belong to us. Signing this agreement gives you the right to use the platform to receive and carry out bookings, and no other right over any of it.

Do not copy the platform, take it apart to see how it works, extract its data automatically, or interfere with how it runs.

## Circumstances beyond control

Neither of us is responsible for failing to do something under this agreement when it is genuinely prevented by something outside our control — a natural disaster, war, a road or border closure, a general strike, a state restriction or a failure of public infrastructure.

Tell the other side as soon as you reasonably can. If the situation lasts more than three days, either of us may propose a different arrangement or end this agreement.

## How this agreement ends

You may end it at any time by giving us 10 days' notice, provided you have carried out the bookings you have already accepted and settled any commission you owe.

We may end it by giving you 10 days' notice. We may end it immediately, and unpublish your profile without notice, if you seriously breach it — for example by driving without a valid licence or insurance, by passing bookings to someone else, by taking bookings off the platform to avoid commission, or by endangering a traveller.

When it ends, your profile stops being visible, you stop receiving bookings, and any commission you owe becomes due immediately. Money we owe you is paid in the ordinary way.

The sections on confidentiality, personal information and responsibility continue to apply after it ends.

## Changing this agreement

We may update this agreement. When we do, we will tell you by email and on your driver page, and you will be asked to read and sign the new version.

Until you sign the new version, the version you signed continues to apply to you. If you do not wish to accept a new version, you may end this agreement as described above.

## Law and disputes

This agreement is governed by the law of Georgia.

If something goes wrong between us, tell us and we will try to settle it by talking. If we cannot, either of us may bring the matter before Tbilisi City Court.

## Language

This agreement exists in Georgian and English. The Georgian text is the governing one; the English text is provided so that it can be read in both languages.

## Signing electronically

You sign by typing your full legal name and confirming on your driver page. Under Georgian law that deliberate electronic confirmation has the same force as a signature written by hand on paper.

When you sign, we record the date and time, your IP address, your device, the language you read, and a cryptographic fingerprint of the exact text that was on the screen. That fingerprint means the version you agreed to can always be identified, even after the document is later revised.

You can read the agreement you signed at any time on your driver page.

## Annex 1 — Commission

Transport services arranged through the platform: **{{COMMISSION_PERCENT}}% of the fare**.

The commission is included in the price shown to the traveller. No other fee is charged to you for the use of the platform.
$contract_en$, false),

('2026-08-v1', 'ka', 'RouteGeorgia-ს მძღოლის ხელშეკრულება', $contract_ka$
წინამდებარე ხელშეკრულება განსაზღვრავს პირობებს, რომლითაც თქვენ RouteGeorgia-ს პლატფორმის მეშვეობით სთავაზობთ მგზავრებს სატრანსპორტო მომსახურებას. გთხოვთ, წაიკითხოთ ხელმოწერამდე. თუ რაიმე გაუგებარია, დაგვისვით შეკითხვა დათანხმებამდე — გვირჩევნია ახლა გიპასუხოთ, ვიდრე მოგვიანებით ვიდავოთ.

## ვის შორის იდება ეს ხელშეკრულება

ხელშეკრულება იდება {{COMPANY_LEGAL_NAME}}-ს (საქართველოში რეგისტრირებული შეზღუდული პასუხისმგებლობის საზოგადოება, საიდენტიფიკაციო ნომერი {{COMPANY_ID_NUMBER}}, იურიდიული მისამართი: {{COMPANY_ADDRESS}}; შემდგომში „RouteGeorgia“, „ჩვენ“) და თქვენ — მძღოლს, რომლის განაცხადიც დავამტკიცეთ (შემდგომში „თქვენ“, „მძღოლი“) — შორის.

ხელშეკრულება ძალაში შედის იმ მომენტიდან, როცა თქვენს მძღოლის გვერდზე ელექტრონულად მოაწერთ ხელს, და ძალაშია მანამ, სანამ რომელიმე მხარე არ შეწყვეტს მას თავში „როგორ სრულდება ეს ხელშეკრულება“ აღწერილი წესით.

## რა არის RouteGeorgia და რა არ არის

RouteGeorgia მართავს ონლაინ პლატფორმას, რომელიც მგზავრებს აკავშირებს საქართველოში მოქმედ დამოუკიდებელ კერძო მძღოლებთან.

ჩვენ ვართ შუამავალი. ჩვენ არ გვეკუთვნის ავტომობილები, არ ვასაქმებთ მძღოლებს და თავად არ ვახორციელებთ მგზავრთა გადაყვანას. სატრანსპორტო მომსახურებას მგზავრს უწევთ თქვენ, უშუალოდ, თქვენივე ლიცენზიებით და თქვენივე პასუხისმგებლობით.

ჩვენ არ ვართ თქვენსა და მგზავრს შორის დადებული სატრანსპორტო ხელშეკრულების მხარე. ჩვენი მომსახურებაა დაკავშირება, ჯავშანი, შეთანხმებული ფასი, თქვენი დოკუმენტების გადამოწმება და ორივე მხარის მხარდაჭერა მგზავრობის მოწყობისა და შესრულების პროცესში.

## ხელშეკრულებაში გამოყენებული ტერმინები

„პლატფორმა“ — RouteGeorgia-ს ვებ-გვერდი და ჩვენ მიერ მოწოდებული ნებისმიერი აპლიკაცია, თქვენს მძღოლის ანგარიშთან ერთად.

„მგზავრი“ — ფიზიკური ან იურიდიული პირი, რომელიც პლატფორმის მეშვეობით ჯავშნის მგზავრობას.

„ჯავშანი“ — დადასტურებული მგზავრობა ფიქსირებული ფასით, მითითებული მარშრუტითა და გამგზავრების დროით.

„ტარიფი“ — მგზავრობის ფასი, რომელსაც თქვენ ადგენთ თქვენი ავტომობილის კატეგორიისთვის გამოქვეყნებულ ფარგლებში და რომელიც მგზავრს ეჩვენება როგორც ერთიანი ფასი მთელ ავტომობილზე.

„საკომისიო“ — ჩვენ მიერ გაწეული მომსახურების საფასური, განსაზღვრული დანართი 1-ით.

„თქვენი ანგარიში“ — თქვენთვის შექმნილი პროფილი პლატფორმაზე, რომელზეც შედიხართ თქვენივე ელფოსტითა და პაროლით.

## როგორ უერთდებით პლატფორმას

თქვენ ავსებთ ჩვენს საჯარო განაცხადის ფორმას და გვაწვდით თქვენს მონაცემებს, ენებს, ავტომობილისა და დოკუმენტების ინფორმაციას.

ჩვენ ვამოწმებთ მოწოდებულს: პირადობას, მართვის მოწმობას, ავტომობილის რეგისტრაციასა და დაზღვევას. შესაძლოა დაგირეკოთ ენებისა და თქვენთვის ნაცნობი მარშრუტების შესახებ სასაუბროდ და მოგთხოვოთ დამატებითი დოკუმენტები, მათ შორის ცნობა ნასამართლობის შესახებ და ტექნიკური ინსპექტირების მოქმედი სერტიფიკატი.

თუ გადავწყვეტთ თქვენთან თანამშრომლობას, დავამტკიცებთ განაცხადს და შემოგთავაზებთ ამ ხელშეკრულებას. დამტკიცება არ ნიშნავს გამოქვეყნებას: თქვენი პროფილი მგზავრებისთვის ხილული ხდება მხოლოდ მას შემდეგ, რაც ხელს მოაწერთ ამ ხელშეკრულებას და ჩვენ გამოვაქვეყნებთ თქვენს პროფილს.

განაცხადზე უარის თქმა ნებისმიერ ეტაპზე შეგვიძლია. უარის შესახებ გაცნობებთ.

## თქვენი ანგარიში

ანგარიში მხოლოდ თქვენია. პაროლი არავის გაუზიაროთ და დაუყოვნებლივ გვაცნობეთ, თუ ფიქრობთ, რომ მასზე სხვას მიუწვდება ხელი.

ყველაფერი, რაც თქვენი ანგარიშით კეთდება, ითვლება თქვენ მიერ განხორციელებულად და გავალდებულებთ როგორც მგზავრის, ისე ჩვენ წინაშე. ეს ჯავშნის დადასტურებასაც ეხება.

ანგარიშზე არსებული ინფორმაცია განაახლეთ და შეინარჩუნეთ სიზუსტე. თუ რამე შეიცვალა — ტელეფონის ნომერი, ავტომობილი, განახლებული მართვის მოწმობა ან დაზღვევა — შეიტანეთ ცვლილება ორ დღეში.

ჩვენ თქვენთან ვკავშირდებით პლატფორმის, ელფოსტისა და SMS-ის მეშვეობით. შეტყობინება ჩაბარებულად ითვლება ანგარიშზე მითითებულ მისამართზე ან ნომერზე გაგზავნის მომენტიდან.

## ფასები, ჯავშნები და გადახდა

ფასებს თქვენ ადგენთ, თითოეული ავტომობილის კატეგორიისთვის ჩვენ მიერ გამოქვეყნებულ ფარგლებში. თქვენ ირჩევთ სამუშაო დღეებს. ნებისმიერ ჯავშანზე შეგიძლიათ უარი თქვათ.

ფასი ფიქსირდება მგზავრის მიერ დაჯავშნის მომენტში და შემდგომ აღარ იცვლება, გარდა იმ შემთხვევისა, როცა მგზავრი ითხოვს მგზავრობის ცვლილებას და ეთანხმება განახლებულ ფასს.

როცა ჯავშანი მოგივათ, დროულად დაადასტურეთ ან უარყავით. თუ გამოქვეყნებულ ვადაში არც დაადასტურებთ და არც უარყოფთ, შესაძლოა დაგიკავშირდეთ; თუ ვერ დაგიკავშირდით, ჯავშანი ჩაითვლება უარყოფილად და მგზავრს სხვა მძღოლს მოვუძებნით.

მგზავრი იხდის ან ნაღდი ანგარიშსწორებით მგზავრობის დასრულებისას, ან ონლაინ, ბარათით.

თუ მგზავრმა ბარათით გადაიხადა, თქვენს წილს გადმოგირიცხავთ თქვენს საბანკო ანგარიშზე გადახდიდან 7 კალენდარული დღის განმავლობაში, საკომისიოსა და თქვენი დავალიანების გამოკლებით.

## საკომისიო

ჩვენი საკომისიოა ტარიფის ის პროცენტი, რომელიც განსაზღვრულია დანართი 1-ით. ის შედის მგზავრისთვის ნაჩვენებ ფასში; მგზავრს ცალკე საჯავშნო საფასური არ ერიცხება.

როცა მგზავრი ბარათით იხდის, საკომისიოს ვაკავებთ თქვენი წილის გადმორიცხვამდე.

როცა მგზავრი ნაღდით გიხდით, ტარიფი მთლიანად თქვენთან რჩება, ხოლო საკომისიო გემატებათ საკომისიოს ბალანსზე, რომელსაც ხედავთ შემოსავლების გვერდზე. ამ ბალანსს ასწორებთ საბანკო გადარიცხვით ან ჩვენს ოფისში.

ამ ბალანსზე დაწესებულია ლიმიტი. თუ დაუფარავი საკომისიო ლიმიტს გადააჭარბებს, ნაღდი ანგარიშსწორების ჯავშნები შეჩერდება ანგარიშსწორებამდე. ბარათით გადახდის ჯავშნები ჩვეულებრივ გრძელდება. ამის შესახებ წინასწარ გაცნობებთ.

ამ ხელშეკრულებით არ არის გათვალისწინებული არც დეპოზიტი და არც ჯარიმები. თუ საკომისიოს გვირიცხავთ, ვალდებული ხართ ის გადაიხადოთ — და სხვა არაფერი.

თუ საკომისიოს განაკვეთს შევცვლით, გაცნობებთ და გთხოვთ ხელშეკრულების ახალი ვერსიის დადასტურებას. უკვე გაკეთებულ ჯავშნებზე ძალაში რჩება ის განაკვეთი, რომელიც მათი გაკეთებისას მოქმედებდა.

## თქვენი ვალდებულებები

გქონდეთ და მოქმედ მდგომარეობაში შეინარჩუნოთ ყველა ლიცენზია, ნებართვა, რეგისტრაცია, დაზღვევა და სერტიფიკატი, რომელსაც საქართველოს კანონმდებლობა მოითხოვს ანაზღაურებადი მგზავრთა გადაყვანისთვის. მოთხოვნისთანავე წარმოგვიდგინეთ დამადასტურებელი დოკუმენტი.

ავტომობილი გქონდეთ ტექნიკურად გამართული, სუფთა და კანონით დადგენილი წესით ინსპექტირებული, სეზონის შესაბამისი ზამთრის საბურავებითა და აღჭურვილობით.

თითოეული ჯავშანი შეასრულეთ პირადად, თქვენს პროფილზე მითითებული ავტომობილით. ჯავშნის სხვა მძღოლისთვის ან სხვა ავტომობილისთვის გადაცემა დაუშვებელია. თუ მგზავრობას ვერ ასრულებთ, უარყავით ჯავშანი ან რაც შეიძლება ადრე გვაცნობეთ.

იმგზავრეთ კანონის დაცვით და უსაფრთხოდ. არასოდეს იმართოთ ავტომობილი ალკოჰოლის, ნარკოტიკული ან სხვა ისეთი ნივთიერების ზემოქმედების ქვეშ, რომელიც მართვაზე მოქმედებს, და მოძრაობისას ხელში არ გეჭიროთ ტელეფონი ან სხვა მოწყობილობა.

არ მოწიოთ ავტომობილში, მგზავრისა და მისი თანმხლები პირების გარდა სხვა არავინ წაიყვანოთ და არ გააკეთოთ გაჩერებები, გარდა საწვავის ჩასხმისა და მგზავრის თხოვნისა.

მგზავრებს მოეპყარით თავაზიანად და არავის მიმართ არ გამოიჩინოთ დისკრიმინაცია.

მიაწოდეთ ზუსტი ინფორმაცია თქვენსა და თქვენს ავტომობილზე — როგორც პროფილზე, ისე მგზავრებთან.

ჯავშანთან დაკავშირებული შეთანხმებები დატოვეთ პლატფორმაზე. ჯავშნის პლატფორმის გვერდის ავლით მოწყობა საკომისიოს არიდების მიზნით მგზავრს ართმევს ჩვენს მხარდაჭერასა და დაცვას და წარმოადგენს ამ ხელშეკრულების მძიმე დარღვევას.

## მგზავრის პერსონალური ინფორმაცია

მგზავრობის შესასრულებლად იღებთ მგზავრის სახელს, ტელეფონის ნომერსა და შეხვედრის დეტალებს. გამოიყენეთ ეს ინფორმაცია მხოლოდ ამ მგზავრობისთვის და სხვა არაფრისთვის.

მგზავრობის დასრულების შემდეგ წაშალეთ იგი. ნუ შეინახავთ, ნუ დაამატებთ საკუთარ ჩანაწერებში და ნუ დაუკავშირდებით მგზავრს სხვა მიზნით.

## შეფასებები და გამოხმაურებები

მგზავრებს შეუძლიათ შეგაფასონ და დაწერონ მგზავრობის შესახებ. თქვენი საშუალო შეფასება ჩანს თქვენს პროფილზე.

შესაძლოა დავადგინოთ მინიმალური შეფასება და პასუხისმგებლობის მინიმალური დონე. თუ თქვენი მაჩვენებელი ამაზე დაბლა დაეცემა, გაცნობებთ და მოგცემთ ვადას გამოსასწორებლად. თუ მდგომარეობა არ გამოსწორდა, შესაძლოა შევაჩეროთ ან შევწყვიტოთ ეს ხელშეკრულება.

შესაძლოა არ გავითვალისწინოთ შეფასება ან გამოხმაურება, რომელიც, ჩვენი აზრით, არაკეთილსინდისიერად არის დატოვებული.

## თქვენ დამოუკიდებელი ხართ

თქვენ ხართ დამოუკიდებელი კონტრაქტორი და არა ჩვენი დასაქმებული. ეს ხელშეკრულება არ წარმოშობს შრომით, პარტნიორულ ან სააგენტო ურთიერთობას.

თქვენ თავად წყვეტთ, როდის და რამდენს იმუშავებთ, და შეგიძლიათ იმუშაოთ ნებისმიერ სხვასთან, მათ შორის ჩვენს კონკურენტებთან.

თქვენ თავად გაწევთ ხარჯებს — საწვავი, დაზღვევა, მომსახურება, ამორტიზაცია, ტელეფონი და ინტერნეტი — და თავად ხართ პასუხისმგებელი თქვენს გადასახადებსა და სოციალურ შენატანებზე. ჩვენ არ ვართ თქვენი საგადასახადო აგენტი.

## პასუხისმგებლობა

მგზავრობაზე პასუხისმგებელი ხართ თქვენ: მის უსაფრთხოდ და კანონიერად შესრულებაზე, ავტომობილის მდგომარეობაზე და იმ ზიანზე, რომელიც ამ დროს მიადგება მგზავრს ან მესამე პირს.

ჩვენ პასუხს ვაგებთ ჩვენს მომსახურებაზე: პლატფორმაზე, ჯავშანზე, შეთანხმებულ ფასზე, დოკუმენტების გადამოწმებასა და მხარდაჭერაზე.

ჩვენ არ გპირდებით ჯავშნების კონკრეტულ რაოდენობას, შემოსავლის რაიმე დონეს ან პლატფორმის უწყვეტ ხელმისაწვდომობას.

ეს ხელშეკრულება არ გამორიცხავს და არ ზღუდავს იმ პასუხისმგებლობას, რომლის გამორიცხვაც კანონით დაუშვებელია, მათ შორის პასუხისმგებლობას გაუფრთხილებლობით გამოწვეულ სიკვდილსა თუ ჯანმრთელობის დაზიანებაზე.

## თქვენი პერსონალური ინფორმაცია

ჩვენ ვაგროვებთ და ვინახავთ თქვენს სახელს, დაბადების თარიღს, საკონტაქტო მონაცემებს, პირადობის დამადასტურებელ დოკუმენტს, მართვის მოწმობას, ავტომობილის რეგისტრაციას, დაზღვევის პოლისს, საბანკო რეკვიზიტებს, ფოტოებს, შეფასებებსა და მგზავრობების ჩანაწერებს.

პირადობისა და მართვის მოწმობის დოკუმენტებს ვინახავთ შეზღუდული წვდომის საცავში, მგზავრებისთვის ხილული ფოტოებისგან განცალკევებით. მათ ხსნის მხოლოდ ის თანამშრომელი, რომელსაც ეს სამუშაოსთვის სჭირდება, და ყოველი გახსნა აღირიცხება ჟურნალში, რომლის შეცვლა ან წაშლა შეუძლებელია.

მგზავრები ხედავენ თქვენს საჯარო სახელს, ფოტოს, ავტომობილს, ენებს, შეფასებასა და გამოხმაურებებს. მათ არ ეჩვენებათ თქვენი დოკუმენტები, დაბადების თარიღი ან საბანკო რეკვიზიტები.

შესაძლოა თქვენი ინფორმაცია გავუზიაროთ სახელმწიფო ორგანოებს, როცა ამას კანონი მოითხოვს, ასევე მგზავრს ან მზღვეველს, როცა ეს ინციდენტის მოსაგვარებლადაა საჭირო.

ინფორმაციას ვინახავთ თქვენი ანგარიშის აქტიურობის პერიოდში და შემდგომ იმ ვადით, რასაც საქართველოს კანონმდებლობა მოითხოვს და რა ვადაშიც შესაძლებელია მოთხოვნის წაყენება.

შეგიძლიათ მოგვთხოვოთ თქვენს შესახებ დაცული ინფორმაციის ასლი, მისი გასწორება ან წაშლა. მოგვწერეთ: {{SUPPORT_EMAIL}}. შევინახავთ იმას, რისი შენახვაც კანონით გვევალება.

## კონფიდენციალურობა

ყველაფერი, რასაც ჩვენთან თანამშრომლობისას შეიტყობთ ჩვენს საქმიანობაზე და რაც საჯარო არ არის — პლატფორმის შიდა მოწყობა, ჩვენი კომერციული პირობები სხვებთან, ჩვენი გეგმები — შეინახეთ საიდუმლოდ, როგორც ხელშეკრულების მოქმედებისას, ისე მისი დასრულების შემდეგ.

იგივე გვევალება ჩვენც თქვენ მიმართ.

## ჩვენი პლატფორმა და ბრენდი

პლატფორმა, მისი პროგრამული უზრუნველყოფა, დიზაინი, მონაცემთა ბაზა, ტექსტები, სახელი და ლოგო ჩვენ გვეკუთვნის. ამ ხელშეკრულებაზე ხელმოწერა გაძლევთ პლატფორმით სარგებლობის უფლებას ჯავშნების მისაღებად და შესასრულებლად და სხვა არანაირ უფლებას.

ნუ დააკოპირებთ პლატფორმას, ნუ დაშლით მისი მოწყობის გასაგებად, ნუ მოიპოვებთ მისი მონაცემების ავტომატურ ამონაწერს და ნუ შეაფერხებთ მის მუშაობას.

## ჩვენგან დამოუკიდებელი გარემოებები

არცერთი მხარე არ აგებს პასუხს ხელშეკრულებით ნაკისრი ვალდებულების შეუსრულებლობაზე, თუ ამას ნამდვილად უშლის ხელს მისგან დამოუკიდებელი გარემოება — სტიქიური უბედურება, ომი, გზის ან საზღვრის ჩაკეტვა, საყოველთაო გაფიცვა, სახელმწიფო შეზღუდვა ან საზოგადოებრივი ინფრასტრუქტურის მწყობრიდან გამოსვლა.

რაც შეიძლება მალე აცნობეთ მეორე მხარეს. თუ მდგომარეობა სამ დღეზე მეტხანს გაგრძელდა, ნებისმიერ მხარეს შეუძლია შესთავაზოს სხვა მოწყობა ან შეწყვიტოს ხელშეკრულება.

## როგორ სრულდება ეს ხელშეკრულება

თქვენ შეგიძლიათ შეწყვიტოთ ნებისმიერ დროს, 10 დღით ადრე შეტყობინებით, იმ პირობით, რომ შეასრულებთ უკვე დადასტურებულ ჯავშნებს და დაფარავთ საკომისიოს დავალიანებას.

ჩვენ შეგვიძლია შევწყვიტოთ 10 დღით ადრე შეტყობინებით. შეგვიძლია შევწყვიტოთ დაუყოვნებლივ და შეტყობინების გარეშე მოვხსნათ თქვენი პროფილი, თუ ხელშეკრულებას მძიმედ დაარღვევთ — მაგალითად, თუ იმგზავრებთ მოქმედი მართვის მოწმობის ან დაზღვევის გარეშე, ჯავშანს სხვას გადასცემთ, ჯავშნებს საკომისიოს არიდების მიზნით პლატფორმის გარეთ გაიტანთ ან მგზავრს საფრთხეს შეუქმნით.

დასრულებისას თქვენი პროფილი წყვეტს ხილვადობას, ჯავშნების მიღება ჩერდება და საკომისიოს დავალიანება დაუყოვნებლივ ექვემდებარება გადახდას. ჩვენი დავალიანება თქვენ წინაშე ანაზღაურდება ჩვეულებრივი წესით.

კონფიდენციალურობის, პერსონალური ინფორმაციისა და პასუხისმგებლობის დებულებები ძალაში რჩება დასრულების შემდეგაც.

## ხელშეკრულების ცვლილება

ჩვენ შეგვიძლია განვაახლოთ ეს ხელშეკრულება. ამის შესახებ გაცნობებთ ელფოსტით და თქვენს მძღოლის გვერდზე, და გთხოვთ ახალი ვერსიის წაკითხვასა და ხელმოწერას.

სანამ ახალ ვერსიას ხელს არ მოაწერთ, თქვენ მიმართ მოქმედებს ის ვერსია, რომელსაც ხელი მოაწერეთ. თუ ახალ ვერსიაზე დათანხმება არ გსურთ, შეგიძლიათ შეწყვიტოთ ხელშეკრულება ზემოთ აღწერილი წესით.

## კანონი და დავები

ხელშეკრულება რეგულირდება საქართველოს კანონმდებლობით.

თუ ჩვენს შორის რამე არ დალაგდა, გვაცნობეთ და შევეცდებით მოლაპარაკებით მოვაგვაროთ. თუ ვერ მოვაგვარეთ, ნებისმიერ მხარეს შეუძლია მიმართოს თბილისის საქალაქო სასამართლოს.

## ენა

ხელშეკრულება არსებობს ქართულ და ინგლისურ ენებზე. მოქმედია ქართული ტექსტი; ინგლისური მოცემულია იმისთვის, რომ ხელშეკრულება ორივე ენაზე იკითხებოდეს.

## ელექტრონული ხელმოწერა

ხელს აწერთ თქვენი სრული სახელისა და გვარის აკრეფითა და თქვენს მძღოლის გვერდზე დადასტურებით. საქართველოს კანონმდებლობით, ასეთ შეგნებულ ელექტრონულ დადასტურებას აქვს ქაღალდზე პირადად შესრულებული ხელმოწერის თანაბარი ძალა.

ხელმოწერისას ვიწერთ თარიღსა და დროს, თქვენს IP მისამართს, მოწყობილობას, წაკითხვის ენას და ეკრანზე არსებული ზუსტი ტექსტის კრიპტოგრაფიულ ანაბეჭდს. ეს ანაბეჭდი იმას ნიშნავს, რომ ყოველთვის დგინდება, რომელ ვერსიას დაეთანხმეთ — მაშინაც კი, თუ დოკუმენტი მოგვიანებით შეიცვლება.

ხელმოწერილი ხელშეკრულების წაკითხვა ნებისმიერ დროს შეგიძლიათ თქვენს მძღოლის გვერდზე.

## დანართი 1 — საკომისიო

პლატფორმის მეშვეობით მოწყობილი სატრანსპორტო მომსახურება: **ტარიფის {{COMMISSION_PERCENT}}%**.

საკომისიო შედის მგზავრისთვის ნაჩვენებ ფასში. პლატფორმით სარგებლობისთვის სხვა საფასური თქვენ არ გერიცხებათ.
$contract_ka$, false);
