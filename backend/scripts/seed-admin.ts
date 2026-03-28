/**
 * Seeds the platform admin in Supabase Auth only (`auth.users` + `user_metadata`).
 * Role and display name live in `user_metadata`; `public.app_users` is not used.
 *
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in backend/.env.
 *
 * Usage: npm run seed:admin
 * Default credentials: admin@miza.dev / Admin123!
 */

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { resolve } from "node:path";

config({ path: resolve(__dirname, "../.env") });

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@miza.dev";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "Admin123!";

function isDuplicateAuthError(message: string): boolean {
    const m = message.toLowerCase();
    return (
        m.includes("already been registered") ||
        m.includes("already registered") ||
        m.includes("duplicate") ||
        m.includes("user already registered")
    );
}

async function main(): Promise<void> {
    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
        throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
    }

    const supabase = createClient(url, serviceKey);

    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        email_confirm: true,
        user_metadata: {
            role: "admin",
            full_name: "Administrator"
        }
    });

    if (createErr) {
        if (!isDuplicateAuthError(createErr.message)) {
            throw createErr;
        }
        process.stdout.write(`Admin already exists in Auth: ${ADMIN_EMAIL}\n`);
        return;
    }

    if (!created.user?.id) {
        throw new Error("Auth createUser returned no user");
    }

    process.stdout.write(`Admin seeded in Auth: ${ADMIN_EMAIL} (id: ${created.user.id})\n`);
}

void main().catch((error) => {
    console.error(error);
    process.exit(1);
});
