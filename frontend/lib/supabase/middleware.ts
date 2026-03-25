import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";

import { env } from "@/lib/env";

export function createSupabaseMiddlewareClient(req: NextRequest, res: NextResponse) {
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return req.cookies.getAll().map((c) => ({ name: c.name, value: c.value }));
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          res.cookies.set(name, value, options);
        });
      },
    },
  });
}

