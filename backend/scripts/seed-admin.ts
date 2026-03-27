/**
 * Upserts the platform admin into Supabase (`app_users` + `app_user_credentials`).
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in env (e.g. backend/.env).
 *
 * Usage: npx tsx scripts/seed-admin.ts
 * Default credentials: admin@miza.dev / Admin123!
 */

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { resolve } from "node:path";
import { hashPassword } from "../src/lib/password";

config({ path: resolve(__dirname, "../.env") });

const ADMIN_ID = process.env.ADMIN_ID ?? "u-admin-1";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@miza.dev";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "Admin123!";

async function main(): Promise<void> {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
    }

    const supabase = createClient(url, key);
    const passwordHash = hashPassword(ADMIN_PASSWORD);

    const { error: userError } = await supabase.from("app_users").upsert(
        {
            id: ADMIN_ID,
            email: ADMIN_EMAIL,
            role: "admin",
            full_name: "Platform Admin"
        },
        { onConflict: "id" }
    );
    if (userError) throw userError;

    const { error: credError } = await supabase.from("app_user_credentials").upsert(
        {
            user_id: ADMIN_ID,
            email: ADMIN_EMAIL.toLowerCase(),
            password_hash: passwordHash
        },
        { onConflict: "user_id" }
    );
    if (credError) throw credError;

    process.stdout.write(`Admin seeded: ${ADMIN_EMAIL} (id: ${ADMIN_ID})\n`);
}

void main().catch((error) => {
    console.error(error);
    process.exit(1);
});
