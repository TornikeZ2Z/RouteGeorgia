-- =========================================================================
-- 0005 — imagery for places, routes and tours
--
-- Photographs are the single biggest thing missing from a travel site, and
-- they must be the operator's own or properly licensed. Rather than ship
-- stock imagery of Georgia with unclear rights, the schema carries an image
-- reference and the public pages fall back to a generated illustration until
-- a real photograph is uploaded through the admin console.
--
-- Keys point at the public-media prefix in object storage, the same place
-- vehicle photos live.
-- =========================================================================

ALTER TABLE locations      ADD COLUMN image_key TEXT, ADD COLUMN image_alt TEXT;
ALTER TABLE route_families ADD COLUMN image_key TEXT, ADD COLUMN image_alt TEXT;
ALTER TABLE tours          ADD COLUMN hero_image_alt TEXT;

COMMENT ON COLUMN locations.image_key IS
  'public-media object key. NULL means the generated illustration is used.';
