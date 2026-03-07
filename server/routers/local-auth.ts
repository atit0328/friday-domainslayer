/**
 * Local Auth Router — Registration + Login with email/password
 * Works alongside Manus OAuth for users who prefer local accounts
 */
import { z } from "zod";
import bcrypt from "bcryptjs";
import { publicProcedure, router } from "../_core/trpc";
import { sdk } from "../_core/sdk";
import { getSessionCookieOptions } from "../_core/cookies";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import * as db from "../db";

// NOTE: Registration is disabled. Only pre-seeded admin/superadmin accounts can login.

export const localAuthRouter = router({
  /**
   * Login with email/password
   */
  login: publicProcedure
    .input(z.object({
      email: z.string().email("กรุณากรอก Email ที่ถูกต้อง"),
      password: z.string().min(1, "กรุณากรอกรหัสผ่าน"),
    }))
    .mutation(async ({ input, ctx }) => {
      const user = await db.getUserByEmail(input.email);
      if (!user || !user.passwordHash) {
        throw new Error("Email หรือรหัสผ่านไม่ถูกต้อง");
      }

      const isValid = await bcrypt.compare(input.password, user.passwordHash);
      if (!isValid) {
        throw new Error("Email หรือรหัสผ่านไม่ถูกต้อง");
      }

      // Update last signed in
      await db.upsertUser({
        openId: user.openId,
        lastSignedIn: new Date(),
      });

      // Create session token and set cookie
      const sessionToken = await sdk.createSessionToken(user.openId, {
        expiresInMs: ONE_YEAR_MS,
        name: user.name || "",
      });

      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, sessionToken, {
        ...cookieOptions,
        maxAge: ONE_YEAR_MS,
      });

      return { success: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
    }),
});
