import { createClient } from "@supabase/supabase-js";
import { env } from "../../config/env";

export function isSupabaseConfigured(): boolean {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return false;
  }
  const hasValidUrl = url.startsWith("http://") || url.startsWith("https://");
  const hasPlaceholderKey = key.includes("your_") || key.includes("replace");
  return hasValidUrl && !hasPlaceholderKey;
}

export function createSupabaseAdminClient() {
  if (!isSupabaseConfigured()) {
    return null;
  }

  return createClient(env.SUPABASE_URL as string, env.SUPABASE_SERVICE_ROLE_KEY as string);
}
