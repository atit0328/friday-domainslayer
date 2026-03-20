import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

/**
 * Dev bypass user — used when DEV_BYPASS_AUTH=true and no database is available.
 * This allows the system to run without OAuth or database for development/demo.
 */
const DEV_ADMIN_USER: User = {
  id: 1,
  openId: "dev_admin",
  name: "AAA Admin",
  email: "admin@aaa.dev",
  loginMethod: "local",
  role: "superadmin",
  plan: "FREE",
  company: null,
  passwordHash: null,
  phone: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  // DEV_BYPASS_AUTH: skip authentication entirely — for development/demo without database
  if (process.env.DEV_BYPASS_AUTH === "true") {
    return {
      req: opts.req,
      res: opts.res,
      user: DEV_ADMIN_USER,
    };
  }

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
