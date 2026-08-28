/**
 * Role-based access control.
 *
 * Deny by default. Permissions are checked on the SERVER for every protected
 * action; hiding a button is presentation, never protection.
 */
export type Role =
  | "CUSTOMER" | "DRIVER_APPLICANT" | "DRIVER"
  | "SUPPORT_AGENT" | "OPERATIONS_MANAGER" | "FINANCE_ADMIN" | "CONTENT_ADMIN" | "SUPER_ADMIN";

export type Permission =
  // driver self-service
  | "driver.application.write" | "driver.availability.write" | "driver.pricing.write"
  | "driver.bookings.read" | "driver.ledger.read"
  // operations
  | "admin.access" | "admin.drivers.read" | "admin.drivers.decide" | "admin.drivers.publish"
  | "admin.documents.read" | "admin.documents.decide"
  | "admin.bookings.read" | "admin.bookings.reassign"
  | "admin.locations.write" | "admin.pricing.bands.write" | "admin.pricing.approve"
  | "admin.content.write"
  | "admin.schools.read" | "admin.schools.write" | "admin.schools.agreement"
  | "admin.finance.read" | "admin.finance.execute"
  | "admin.audit.read" | "admin.rbac.write";

const DRIVER: Permission[] = [
  "driver.application.write", "driver.availability.write", "driver.pricing.write",
  "driver.bookings.read", "driver.ledger.read",
];

const SUPPORT: Permission[] = [
  "admin.access", "admin.drivers.read", "admin.documents.read", "admin.bookings.read",
  "admin.schools.read",
];

const OPERATIONS: Permission[] = [
  ...SUPPORT,
  "admin.drivers.decide", "admin.drivers.publish", "admin.documents.decide",
  "admin.bookings.reassign", "admin.locations.write", "admin.pricing.approve",
  "admin.schools.write", "admin.schools.agreement",
];

const FINANCE: Permission[] = [
  "admin.access", "admin.bookings.read", "admin.finance.read", "admin.finance.execute",
];

const CONTENT: Permission[] = [
  "admin.access", "admin.content.write", "admin.locations.write",
];

/**
 * Note the deliberate omissions. Support cannot decide on drivers or touch
 * money. Operations cannot execute payouts. Content cannot see driver KYC.
 * Only SUPER_ADMIN holds admin.rbac.write.
 */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  CUSTOMER: [],
  DRIVER_APPLICANT: ["driver.application.write"],
  DRIVER: DRIVER,
  SUPPORT_AGENT: SUPPORT,
  OPERATIONS_MANAGER: OPERATIONS,
  FINANCE_ADMIN: FINANCE,
  CONTENT_ADMIN: CONTENT,
  SUPER_ADMIN: [
    ...new Set<Permission>([
      ...OPERATIONS, ...FINANCE, ...CONTENT,
      "admin.audit.read", "admin.rbac.write",
    ]),
  ],
};

export function can(roles: readonly Role[], permission: Permission): boolean {
  return roles.some((role) => ROLE_PERMISSIONS[role]?.includes(permission));
}

export function canAny(roles: readonly Role[], permissions: readonly Permission[]): boolean {
  return permissions.some((p) => can(roles, p));
}

/** High-risk actions that require a written reason and re-authentication. */
export const REASON_REQUIRED: ReadonlySet<Permission> = new Set([
  "admin.drivers.decide", "admin.drivers.publish", "admin.documents.decide",
  "admin.bookings.reassign", "admin.finance.execute", "admin.rbac.write",
  "admin.schools.agreement",
]);

export class ForbiddenError extends Error {
  constructor(public readonly permission: Permission) {
    super(`Missing permission: ${permission}`);
    this.name = "ForbiddenError";
  }
}
