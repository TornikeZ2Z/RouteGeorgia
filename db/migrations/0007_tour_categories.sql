-- Tour categories, per the founder recommendations: travellers should be able
-- to pick by kind (sea, mountains, winter resorts, culture/history, wine and
-- food) instead of scanning every tour. TEXT with a CHECK rather than an enum:
-- categories are content vocabulary, not lifecycle states.
ALTER TABLE tours ADD COLUMN category TEXT NOT NULL DEFAULT 'culture'
  CHECK (category IN ('sea','mountains','winter','culture','wine'));

UPDATE tours SET category = 'mountains' WHERE slug IN ('kazbegi-gergeti-day-trip','svaneti-three-days');
UPDATE tours SET category = 'wine'      WHERE slug = 'kakheti-wine-day-trip';
UPDATE tours SET category = 'culture'   WHERE slug IN ('mtskheta-jvari-day-trip','borjomi-vardzia-day-trip');
