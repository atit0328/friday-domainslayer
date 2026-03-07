/**
 * User Management Router — Superadmin only
 * List users, create/delete admins, update roles, reset passwords
 */
import { z } from "zod";
import bcrypt from "bcryptjs";
import { superadminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { users } from "../../drizzle/schema";
import { eq, desc, like, or, sql } from "drizzle-orm";

export const userManagementRouter = router({
  // List all users with pagination and search
  list: superadminProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
        search: z.string().optional(),
        roleFilter: z.enum(["all", "admin", "superadmin"]).default("all"),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { users: [], total: 0 };

      let query = db.select().from(users);
      let countQuery = db.select({ count: sql<number>`count(*)` }).from(users);

      const conditions: any[] = [];

      if (input.search) {
        const searchPattern = `%${input.search}%`;
        conditions.push(
          or(
            like(users.name, searchPattern),
            like(users.email, searchPattern),
            like(users.openId, searchPattern),
            like(users.phone, searchPattern)
          )
        );
      }

      if (input.roleFilter !== "all") {
        conditions.push(eq(users.role, input.roleFilter));
      }

      if (conditions.length > 0) {
        const combined = conditions.reduce((acc, cond) => acc ? sql`${acc} AND ${cond}` : cond, null);
        query = query.where(combined) as any;
        countQuery = countQuery.where(combined) as any;
      }

      const [userList, countResult] = await Promise.all([
        query.orderBy(desc(users.createdAt)).limit(input.limit).offset(input.offset),
        countQuery,
      ]);

      return {
        users: userList.map((u) => ({
          id: u.id,
          openId: u.openId,
          name: u.name,
          email: u.email,
          phone: u.phone,
          role: u.role,
          plan: u.plan,
          loginMethod: u.loginMethod,
          createdAt: u.createdAt,
          lastSignedIn: u.lastSignedIn,
        })),
        total: (countResult as any)[0]?.count ?? 0,
      };
    }),

  // Create a new admin account (superadmin only)
  createAdmin: superadminProcedure
    .input(
      z.object({
        email: z.string().email("กรุณากรอก Email ที่ถูกต้อง"),
        name: z.string().min(1, "กรุณากรอกชื่อ"),
        password: z.string().min(6, "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร"),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Check if email already exists
      const existing = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
      if (existing.length > 0) {
        throw new Error("Email นี้ถูกใช้งานแล้ว");
      }

      const passwordHash = await bcrypt.hash(input.password, 12);
      const openId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

      await db.insert(users).values({
        openId,
        email: input.email,
        name: input.name,
        passwordHash,
        loginMethod: "local",
        role: "admin",
        lastSignedIn: new Date(),
      });

      return { success: true, message: `สร้าง Admin ${input.email} สำเร็จ` };
    }),

  // Delete a user (superadmin only, cannot delete self or other superadmins)
  deleteUser: superadminProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      if (ctx.user.id === input.userId) {
        throw new Error("ไม่สามารถลบตัวเองได้");
      }

      // Check target user
      const target = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
      if (!target[0]) throw new Error("ไม่พบผู้ใช้");
      if (target[0].role === "superadmin") {
        throw new Error("ไม่สามารถลบ Superadmin ได้");
      }

      await db.delete(users).where(eq(users.id, input.userId));
      return { success: true, message: `ลบผู้ใช้ ${target[0].email} สำเร็จ` };
    }),

  // Update a user's role (only between admin ↔ superadmin)
  updateRole: superadminProcedure
    .input(
      z.object({
        userId: z.number(),
        newRole: z.enum(["admin", "superadmin"]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      if (ctx.user.id === input.userId) {
        throw new Error("ไม่สามารถเปลี่ยน role ของตัวเองได้");
      }

      await db
        .update(users)
        .set({ role: input.newRole })
        .where(eq(users.id, input.userId));

      return { success: true, userId: input.userId, newRole: input.newRole };
    }),

  // Reset a user's password (superadmin only)
  resetPassword: superadminProcedure
    .input(
      z.object({
        userId: z.number(),
        newPassword: z.string().min(6, "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const target = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
      if (!target[0]) throw new Error("ไม่พบผู้ใช้");

      // Cannot reset another superadmin's password (only own)
      if (target[0].role === "superadmin" && ctx.user.id !== input.userId) {
        throw new Error("ไม่สามารถรีเซ็ตรหัสผ่านของ Superadmin คนอื่นได้");
      }

      const passwordHash = await bcrypt.hash(input.newPassword, 12);
      await db.update(users).set({ passwordHash }).where(eq(users.id, input.userId));

      return { success: true, message: `รีเซ็ตรหัสผ่านของ ${target[0].email} สำเร็จ` };
    }),

  // Get single user details
  getUser: superadminProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      const result = await db
        .select()
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);

      if (!result[0]) return null;

      const u = result[0];
      return {
        id: u.id,
        openId: u.openId,
        name: u.name,
        email: u.email,
        phone: u.phone,
        role: u.role,
        plan: u.plan,
        company: u.company,
        loginMethod: u.loginMethod,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
        lastSignedIn: u.lastSignedIn,
      };
    }),

  // Get role statistics
  stats: superadminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { total: 0, admins: 0, superadmins: 0 };

    const result = await db
      .select({
        role: users.role,
        count: sql<number>`count(*)`,
      })
      .from(users)
      .groupBy(users.role);

    const stats = { total: 0, admins: 0, superadmins: 0 };
    for (const row of result) {
      const count = Number(row.count);
      stats.total += count;
      if (row.role === "admin") stats.admins = count;
      if (row.role === "superadmin") stats.superadmins = count;
    }
    return stats;
  }),
});
