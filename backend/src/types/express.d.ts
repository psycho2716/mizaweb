import type { SupabaseClient } from "@supabase/supabase-js";

export type AppUserRole = "admin" | "seller" | "customer";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userRole?: AppUserRole;
      supabaseUser?: SupabaseClient;
      bearerToken?: string;
    }
  }
}

export {};
