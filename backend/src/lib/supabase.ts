import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

export function createAnonSupabaseClient(): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
}

export function createAdminSupabaseClient(): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}

export function createAuthedSupabaseClient(accessToken: string): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

