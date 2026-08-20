-- Twelve curated destinations from the founder's map brief: Guria (Bakhmaro,
-- the Shekvetili–Ureki coast), Racha, Samegrelo, Samtskhe-Javakheti and inner
-- Kakheti. Each is a REAL bookable location — search prices any pair through
-- the routing fallback — and a pin on the Explore Georgia map. Sub-places the
-- brief mentions (Grigoleti, Shaori, Nikortsminda, Rabati, Lopota, the
-- Dendrological Park) live in the destination descriptions, not as pins: the
-- map is curated, not Google Maps.
INSERT INTO locations (slug, type, name_en, name_ka, name_ru, lat, lon, timezone, in_service_area, seo_indexed)
VALUES
  ('bakhmaro',    'RESORT',     'Bakhmaro',            'ბახმარო',      'Бахмаро',      41.849, 42.323, 'Asia/Tbilisi', true, false),
  ('shekvetili',  'RESORT',     'Shekvetili',          'შეკვეთილი',    'Шекветили',    41.943, 41.772, 'Asia/Tbilisi', true, false),
  ('ureki',       'RESORT',     'Ureki',               'ურეკი',        'Уреки',        41.996, 41.762, 'Asia/Tbilisi', true, false),
  ('ambrolauri',  'TOWN',       'Ambrolauri (Racha)',  'ამბროლაური',   'Амбролаури',   42.520, 43.154, 'Asia/Tbilisi', true, false),
  ('oni',         'TOWN',       'Oni',                 'ონი',          'Они',          42.582, 43.442, 'Asia/Tbilisi', true, false),
  ('martvili',    'ATTRACTION', 'Martvili Canyon',     'მარტვილი',     'Мартвили',     42.457, 42.378, 'Asia/Tbilisi', true, false),
  ('zugdidi',     'TOWN',       'Zugdidi',             'ზუგდიდი',      'Зугдиди',      42.509, 41.870, 'Asia/Tbilisi', true, false),
  ('bakuriani',   'RESORT',     'Bakuriani',           'ბაკურიანი',    'Бакуриани',    41.750, 43.530, 'Asia/Tbilisi', true, false),
  ('akhaltsikhe', 'TOWN',       'Akhaltsikhe (Rabati)','ახალციხე',     'Ахалцихе',     41.639, 42.986, 'Asia/Tbilisi', true, false),
  ('abastumani',  'RESORT',     'Abastumani',          'აბასთუმანი',   'Абастумани',   41.752, 42.826, 'Asia/Tbilisi', true, false),
  ('kvareli',     'TOWN',       'Kvareli',             'ყვარელი',      'Кварели',      41.952, 45.816, 'Asia/Tbilisi', true, false),
  ('tsinandali',  'ATTRACTION', 'Tsinandali',          'წინანდალი',    'Цинандали',    41.897, 45.577, 'Asia/Tbilisi', true, false)
ON CONFLICT (slug) DO NOTHING;
