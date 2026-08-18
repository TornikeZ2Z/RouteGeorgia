/**
 * Drizzle schema. This mirrors db/migrations/0001_baseline.sql, which remains
 * the source of truth for constraints the ORM cannot express (EXCLUDE,
 * generated columns, append-only triggers).
 */
import {
  pgTable, pgEnum, uuid, text, integer, bigint, boolean, timestamp, date,
  doublePrecision, jsonb, numeric, bigserial, primaryKey, uniqueIndex, index,
} from "drizzle-orm/pg-core";

export const userStatus    = pgEnum("user_status", ["ACTIVE","PENDING","SUSPENDED","CLOSED"]);
export const appRole       = pgEnum("app_role", [
  "CUSTOMER","DRIVER_APPLICANT","DRIVER",
  "SUPPORT_AGENT","OPERATIONS_MANAGER","FINANCE_ADMIN","CONTENT_ADMIN","SUPER_ADMIN"]);
export const driverStatus  = pgEnum("driver_status", [
  "DRAFT","SUBMITTED","IN_REVIEW","CHANGES_REQUESTED","APPROVED","SUSPENDED","REJECTED"]);
export const docType       = pgEnum("doc_type", [
  "IDENTITY","DRIVING_LICENSE","VEHICLE_REGISTRATION","INSURANCE","INSPECTION","TRAINING","OTHER"]);
export const reviewState   = pgEnum("review_state", ["PENDING","APPROVED","CHANGES_REQUESTED","REJECTED","EXPIRED"]);
export const proficiency   = pgEnum("proficiency", ["BASIC","CONVERSATIONAL","FLUENT","NATIVE"]);
export const vehicleClass  = pgEnum("vehicle_class", ["ECONOMY","COMFORT","MINIVAN","SUV_4X4","MINIBUS","PREMIUM"]);
export const vehicleStatus = pgEnum("vehicle_status", ["DRAFT","SUBMITTED","APPROVED","SUSPENDED","RETIRED"]);
export const locationType  = pgEnum("location_type", ["AIRPORT","CITY","TOWN","ATTRACTION","RESORT","BORDER","ADDRESS"]);
export const planStatus    = pgEnum("plan_status", ["DRAFT","PENDING_APPROVAL","ACTIVE","SUPERSEDED","REJECTED"]);
export const blockKind     = pgEnum("block_kind", ["BOOKING","BUSY","TIME_OFF","REST_BUFFER"]);
export const quoteStatus   = pgEnum("quote_status", ["OPEN","HELD","CONSUMED","EXPIRED"]);
export const bookingStatus = pgEnum("booking_status", [
  "DRAFT","HELD","PENDING_PAYMENT","CONFIRMED","DRIVER_ACKNOWLEDGED","READY",
  "DRIVER_ARRIVED","IN_PROGRESS","COMPLETED","CANCELLED","REASSIGNING","DISPUTED","CLOSED","EXPIRED"]);
export const paymentMode   = pgEnum("payment_mode", ["CASH","CARD"]);

const money = (name: string) => bigint(name, { mode: "bigint" });

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  emailNormalized: text("email_normalized"),
  phone: text("phone"),
  passwordHash: text("password_hash"),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  phoneVerifiedAt: timestamp("phone_verified_at", { withTimezone: true }),
  locale: text("locale").notNull().default("en"),
  status: userStatus("status").notNull().default("ACTIVE"),
  mfaEnrolledAt: timestamp("mfa_enrolled_at", { withTimezone: true }),
  lastAuthAt: timestamp("last_auth_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userRoles = pgTable("user_roles", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: appRole("role").notNull(),
  grantedBy: uuid("granted_by"),
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.role] })]);

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  ip: text("ip"),
  userAgent: text("user_agent"),
});

export const loginTokens = pgTable("login_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  purpose: text("purpose").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const consents = pgTable("consents", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  policyVersion: text("policy_version").notNull(),
  locale: text("locale").notNull(),
  accepted: boolean("accepted").notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
  evidence: jsonb("evidence").notNull().default({}),
});

export const locations = pgTable("locations", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  type: locationType("type").notNull(),
  nameEn: text("name_en").notNull(),
  nameKa: text("name_ka"),
  nameRu: text("name_ru"),
  region: text("region"),
  lat: doublePrecision("lat").notNull(),
  lon: doublePrecision("lon").notNull(),
  timezone: text("timezone").notNull().default("Asia/Tbilisi"),
  providerPlaceId: text("provider_place_id"),
  inServiceArea: boolean("in_service_area").notNull().default(true),
  seoIndexed: boolean("seo_indexed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const routeFamilies = pgTable("route_families", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  originId: uuid("origin_id").notNull().references(() => locations.id),
  destinationId: uuid("destination_id").notNull().references(() => locations.id),
  distanceKm: numeric("distance_km", { precision: 8, scale: 2 }).notNull(),
  driveMinutes: integer("drive_minutes").notNull(),
  returnKm: numeric("return_km", { precision: 8, scale: 2 }).notNull(),
  deadheadRecoveryBps: integer("deadhead_recovery_bps").notNull().default(5000),
  riskFactorBps: integer("risk_factor_bps").notNull().default(10000),
  minFareMinor: money("min_fare_minor").notNull().default(0n),
  requires4x4: boolean("requires_4x4").notNull().default(false),
  seasonalNote: text("seasonal_note"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const driverProfiles = pgTable("driver_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  handle: text("handle").notNull().unique(),
  legalFirstName: text("legal_first_name"),
  legalLastName: text("legal_last_name"),
  publicName: text("public_name").notNull(),
  dateOfBirth: date("date_of_birth"),
  baseLocationId: uuid("base_location_id").references(() => locations.id),
  bio: text("bio"),
  emergencyContact: text("emergency_contact"),
  status: driverStatus("status").notNull().default("DRAFT"),
  published: boolean("published").notNull().default(false),
  suspendedReason: text("suspended_reason"),
  ratingSum: integer("rating_sum").notNull().default(0),
  ratingCount: integer("rating_count").notNull().default(0),
  completedTrips: integer("completed_trips").notNull().default(0),
  ackOnTime: integer("ack_on_time").notNull().default(0),
  ackTotal: integer("ack_total").notNull().default(0),
  driverCancels: integer("driver_cancels").notNull().default(0),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const driverLanguages = pgTable("driver_languages", {
  driverId: uuid("driver_id").notNull().references(() => driverProfiles.id, { onDelete: "cascade" }),
  language: text("language").notNull(),
  declaredLevel: proficiency("declared_level").notNull(),
  verifiedLevel: proficiency("verified_level"),
  verifiedBy: uuid("verified_by"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
}, (t) => [primaryKey({ columns: [t.driverId, t.language] })]);

export const vehicles = pgTable("vehicles", {
  id: uuid("id").primaryKey().defaultRandom(),
  driverId: uuid("driver_id").notNull().references(() => driverProfiles.id, { onDelete: "cascade" }),
  make: text("make").notNull(),
  model: text("model").notNull(),
  year: integer("year").notNull(),
  color: text("color"),
  plate: text("plate").notNull(),
  class: vehicleClass("class").notNull(),
  body: text("body"),
  seats: integer("seats").notNull(),
  luggage: integer("luggage").notNull().default(0),
  amenities: jsonb("amenities").notNull().default({}),
  capabilities: jsonb("capabilities").notNull().default({}),
  status: vehicleStatus("status").notNull().default("DRAFT"),
  published: boolean("published").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const vehicleMedia = pgTable("vehicle_media", {
  id: uuid("id").primaryKey().defaultRandom(),
  vehicleId: uuid("vehicle_id").notNull().references(() => vehicles.id, { onDelete: "cascade" }),
  storageKey: text("storage_key").notNull(),
  position: integer("position").notNull().default(0),
  viewType: text("view_type"),
  altText: text("alt_text"),
  checksum: text("checksum"),
  moderationState: reviewState("moderation_state").notNull().default("PENDING"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const driverDocuments = pgTable("driver_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  driverId: uuid("driver_id").notNull().references(() => driverProfiles.id, { onDelete: "cascade" }),
  vehicleId: uuid("vehicle_id").references(() => vehicles.id, { onDelete: "cascade" }),
  type: docType("type").notNull(),
  storageKey: text("storage_key").notNull(),
  numberHash: text("number_hash"),
  mimeType: text("mime_type"),
  sizeBytes: integer("size_bytes"),
  checksum: text("checksum"),
  issuedOn: date("issued_on"),
  expiresOn: date("expires_on"),
  isMandatory: boolean("is_mandatory").notNull().default(true),
  state: reviewState("state").notNull().default("PENDING"),
  reviewedBy: uuid("reviewed_by"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewReason: text("review_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const driverDecisions = pgTable("driver_decisions", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  driverId: uuid("driver_id").notNull().references(() => driverProfiles.id, { onDelete: "cascade" }),
  fromState: driverStatus("from_state").notNull(),
  toState: driverStatus("to_state").notNull(),
  reason: text("reason").notNull(),
  actorId: uuid("actor_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const priceBands = pgTable("price_bands", {
  id: uuid("id").primaryKey().defaultRandom(),
  class: vehicleClass("class").notNull().unique(),
  currency: text("currency").notNull().default("GEL"),
  minRatePerKmMinor: money("min_rate_per_km_minor").notNull(),
  maxRatePerKmMinor: money("max_rate_per_km_minor").notNull(),
  minFareFloorMinor: money("min_fare_floor_minor").notNull(),
  maxFareCeilingMinor: money("max_fare_ceiling_minor").notNull(),
  maxOvernightMinor: money("max_overnight_minor").notNull().default(0n),
  maxSeasonFactorBps: integer("max_season_factor_bps").notNull().default(13000),
  active: boolean("active").notNull().default(true),
});

export const pricePlans = pgTable("price_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  driverId: uuid("driver_id").notNull().references(() => driverProfiles.id, { onDelete: "cascade" }),
  vehicleId: uuid("vehicle_id").notNull().references(() => vehicles.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  currency: text("currency").notNull().default("GEL"),
  ratePerKmMinor: money("rate_per_km_minor").notNull(),
  ratePerMinuteMinor: money("rate_per_minute_minor").notNull().default(0n),
  perStopFeeMinor: money("per_stop_fee_minor").notNull().default(0n),
  overnightFeeMinor: money("overnight_fee_minor").notNull().default(0n),
  minimumFareMinor: money("minimum_fare_minor").notNull().default(0n),
  seasonFactorBps: integer("season_factor_bps").notNull().default(10000),
  status: planStatus("status").notNull().default("DRAFT"),
  effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull().defaultNow(),
  effectiveTo: timestamp("effective_to", { withTimezone: true }),
  approvedBy: uuid("approved_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const exchangeRates = pgTable("exchange_rates", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  base: text("base").notNull(),
  quote: text("quote").notNull(),
  rateMicro: money("rate_micro").notNull(),
  asOf: timestamp("as_of", { withTimezone: true }).notNull(),
  provider: text("provider").notNull(),
});

export const availabilityBlocks = pgTable("availability_blocks", {
  id: uuid("id").primaryKey().defaultRandom(),
  driverId: uuid("driver_id").notNull().references(() => driverProfiles.id, { onDelete: "cascade" }),
  // TSTZRANGE has no first-class Drizzle type; reads/writes go through
  // src/lib/availability.ts using raw SQL so the EXCLUDE constraint applies.
  kind: blockKind("kind").notNull(),
  bookingId: uuid("booking_id"),
  reasonCategory: text("reason_category"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const routeSearches = pgTable("route_searches", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionKey: text("session_key"),
  originId: uuid("origin_id").references(() => locations.id),
  destinationId: uuid("destination_id").references(() => locations.id),
  itinerary: jsonb("itinerary").notNull(),
  itineraryHash: text("itinerary_hash").notNull(),
  travelAt: timestamp("travel_at", { withTimezone: true }).notNull(),
  serviceTz: text("service_tz").notNull().default("Asia/Tbilisi"),
  passengers: integer("passengers").notNull().default(1),
  luggage: integer("luggage").notNull().default(0),
  attribution: jsonb("attribution").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const quotes = pgTable("quotes", {
  id: uuid("id").primaryKey().defaultRandom(),
  searchId: uuid("search_id").notNull().references(() => routeSearches.id, { onDelete: "cascade" }),
  driverId: uuid("driver_id").notNull().references(() => driverProfiles.id),
  vehicleId: uuid("vehicle_id").notNull().references(() => vehicles.id),
  pricePlanId: uuid("price_plan_id").notNull().references(() => pricePlans.id),
  routeFamilyId: uuid("route_family_id").references(() => routeFamilies.id),
  engineVersion: text("engine_version").notNull(),
  inputs: jsonb("inputs").notNull(),
  breakdown: jsonb("breakdown").notNull(),
  currency: text("currency").notNull().default("GEL"),
  grossMinor: money("gross_minor").notNull(),
  commissionRateBps: integer("commission_rate_bps").notNull(),
  commissionMinor: money("commission_minor").notNull(),
  driverNetMinor: money("driver_net_minor").notNull(),
  displayCurrency: text("display_currency"),
  displayRateMicro: money("display_rate_micro"),
  status: quoteStatus("status").notNull().default("OPEN"),
  heldUntil: timestamp("held_until", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const bookings = pgTable("bookings", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  customerUserId: uuid("customer_user_id").references(() => users.id),
  customerEmail: text("customer_email").notNull(),
  customerPhone: text("customer_phone"),
  quoteId: uuid("quote_id").notNull().unique().references(() => quotes.id),
  driverId: uuid("driver_id").notNull().references(() => driverProfiles.id),
  vehicleId: uuid("vehicle_id").notNull().references(() => vehicles.id),
  status: bookingStatus("status").notNull().default("DRAFT"),
  paymentMode: paymentMode("payment_mode").notNull(),
  serviceStartAt: timestamp("service_start_at", { withTimezone: true }).notNull(),
  serviceTz: text("service_tz").notNull().default("Asia/Tbilisi"),
  grossMinor: money("gross_minor").notNull(),
  currency: text("currency").notNull().default("GEL"),
  commissionRateBps: integer("commission_rate_bps").notNull(),
  commissionMinor: money("commission_minor").notNull(),
  driverNetMinor: money("driver_net_minor").notNull(),
  policyVersion: text("policy_version").notNull(),
  attribution: jsonb("attribution").notNull().default({}),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const bookingStatusHistory = pgTable("booking_status_history", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  bookingId: uuid("booking_id").notNull().references(() => bookings.id, { onDelete: "cascade" }),
  fromStatus: bookingStatus("from_status"),
  toStatus: bookingStatus("to_status").notNull(),
  actorId: uuid("actor_id"),
  actorRole: appRole("actor_role"),
  reason: text("reason"),
  correlationId: text("correlation_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLogs = pgTable("audit_logs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  actorUserId: uuid("actor_user_id"),
  actorRole: appRole("actor_role"),
  action: text("action").notNull(),
  objectType: text("object_type").notNull(),
  objectId: text("object_id"),
  before: jsonb("before"),
  after: jsonb("after"),
  reason: text("reason"),
  correlationId: text("correlation_id"),
  ip: text("ip"),
});

export const contentPages = pgTable("content_pages", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull(),
  locale: text("locale").notNull(),
  kind: text("kind").notNull().default("PAGE"),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  metaTitle: text("meta_title"),
  metaDesc: text("meta_desc"),
  published: boolean("published").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("content_pages_slug_locale_uq").on(t.slug, t.locale)]);
