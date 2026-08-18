import { describe, it, expect } from "vitest";
import { can, ROLE_PERMISSIONS, type Role } from "@/lib/rbac";

describe("rbac", () => {
  it("denies by default", () => {
    expect(can([], "admin.access")).toBe(false);
    expect(can(["CUSTOMER"], "admin.access")).toBe(false);
    expect(can(["DRIVER"], "admin.drivers.decide")).toBe(false);
  });

  it("keeps support agents out of decisions and money", () => {
    expect(can(["SUPPORT_AGENT"], "admin.drivers.read")).toBe(true);
    expect(can(["SUPPORT_AGENT"], "admin.drivers.decide")).toBe(false);
    expect(can(["SUPPORT_AGENT"], "admin.finance.execute")).toBe(false);
    expect(can(["SUPPORT_AGENT"], "admin.rbac.write")).toBe(false);
  });

  it("keeps operations out of payout execution", () => {
    expect(can(["OPERATIONS_MANAGER"], "admin.drivers.decide")).toBe(true);
    expect(can(["OPERATIONS_MANAGER"], "admin.finance.execute")).toBe(false);
  });

  it("keeps content administrators away from driver KYC", () => {
    expect(can(["CONTENT_ADMIN"], "admin.content.write")).toBe(true);
    expect(can(["CONTENT_ADMIN"], "admin.documents.read")).toBe(false);
    expect(can(["CONTENT_ADMIN"], "admin.drivers.read")).toBe(false);
  });

  it("gives only the super admin RBAC and audit rights", () => {
    const roles: Role[] = ["SUPPORT_AGENT", "OPERATIONS_MANAGER", "FINANCE_ADMIN", "CONTENT_ADMIN", "DRIVER"];
    for (const r of roles) {
      expect(can([r], "admin.rbac.write")).toBe(false);
      expect(can([r], "admin.audit.read")).toBe(false);
    }
    expect(can(["SUPER_ADMIN"], "admin.rbac.write")).toBe(true);
    expect(can(["SUPER_ADMIN"], "admin.audit.read")).toBe(true);
  });

  it("gives a driver applicant nothing beyond their own application", () => {
    expect(ROLE_PERMISSIONS.DRIVER_APPLICANT).toEqual(["driver.application.write"]);
  });

  it("combines permissions across multiple held roles", () => {
    expect(can(["SUPPORT_AGENT", "FINANCE_ADMIN"], "admin.finance.execute")).toBe(true);
  });
});
