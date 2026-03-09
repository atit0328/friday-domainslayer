/**
 * Admin Access Tests
 * Verify that isAdminUser correctly identifies admin/superadmin users
 * and that the bypass pattern works for data access
 */
import { describe, it, expect } from "vitest";
import { isAdminUser } from "./_core/trpc";

describe("isAdminUser helper", () => {
  it("returns true for admin role", () => {
    const user = { id: 1, role: "admin", openId: "test", name: "Admin" };
    expect(isAdminUser(user as any)).toBe(true);
  });

  it("returns true for superadmin role", () => {
    const user = { id: 1, role: "superadmin", openId: "test", name: "Super" };
    expect(isAdminUser(user as any)).toBe(true);
  });

  it("returns false for regular user role", () => {
    const user = { id: 1, role: "user", openId: "test", name: "User" };
    expect(isAdminUser(user as any)).toBe(false);
  });

  it("returns false for undefined role", () => {
    const user = { id: 1, openId: "test", name: "NoRole" };
    expect(isAdminUser(user as any)).toBe(false);
  });

  it("returns false for null user", () => {
    expect(isAdminUser(null as any)).toBe(false);
  });
});

describe("Admin userId bypass pattern", () => {
  it("admin gets undefined userId (sees all data)", () => {
    const adminUser = { id: 100, role: "admin", openId: "a", name: "Admin" };
    const userId = isAdminUser(adminUser as any) ? undefined : adminUser.id;
    expect(userId).toBeUndefined();
  });

  it("superadmin gets undefined userId (sees all data)", () => {
    const superUser = { id: 200, role: "superadmin", openId: "s", name: "Super" };
    const userId = isAdminUser(superUser as any) ? undefined : superUser.id;
    expect(userId).toBeUndefined();
  });

  it("regular user gets their own userId (sees only own data)", () => {
    const regularUser = { id: 300, role: "user", openId: "u", name: "Regular" };
    const userId = isAdminUser(regularUser as any) ? undefined : regularUser.id;
    expect(userId).toBe(300);
  });
});
