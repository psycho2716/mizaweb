import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

function getEnv() {
  const required = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "ADMIN_EMAIL", "ADMIN_PASSWORD"] as const;
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(`Missing env vars: ${missing.join(", ")}`);
  }

  return {
    SUPABASE_URL: process.env.SUPABASE_URL as string,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY as string,
    ADMIN_EMAIL: process.env.ADMIN_EMAIL as string,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD as string,
  };
}

async function main() {
  const env = getEnv();
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

  // If the admin already exists, this should succeed.
  const signInAttempt = await supabase.auth.signInWithPassword({
    email: env.ADMIN_EMAIL,
    password: env.ADMIN_PASSWORD,
  });

  if (!signInAttempt.error) {
    // eslint-disable-next-line no-console
    console.log("[seed-admin] Admin already exists; can sign in:", signInAttempt.data.user.id);
    return;
  }

  // Otherwise, create the admin via Auth signUp so GoTrue creates the correct auth/identity rows.
  // After creation, our DB trigger (`public.handle_new_user`) will set `profiles.role = admin`.
  const { data, error } = await supabase.auth.signUp({
    email: env.ADMIN_EMAIL,
    password: env.ADMIN_PASSWORD,
    options: {
      data: {
        role: "admin",
        fullName: "Initial Admin",
      },
    },
  });

  if (error) {
    const msg = error.message ?? "";
    const alreadyExists =
      msg.toLowerCase().includes("already registered") ||
      msg.toLowerCase().includes("user already exists") ||
      msg.toLowerCase().includes("duplicate") ||
      msg.toLowerCase().includes("already");

    if (!alreadyExists) {
      throw error;
    }
  } else {
    // eslint-disable-next-line no-console
    console.log("[seed-admin] Admin created:", data.user?.id);
  }

  // Validate credentials by attempting a login again.
  const signIn = await supabase.auth.signInWithPassword({
    email: env.ADMIN_EMAIL,
    password: env.ADMIN_PASSWORD,
  });

  if (signIn.error) {
    throw new Error(`[seed-admin] Admin login failed after creation: ${signIn.error.message}`);
  }

  // eslint-disable-next-line no-console
  console.log("[seed-admin] Admin can sign in:", signIn.data.user.id);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

