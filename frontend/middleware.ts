import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { createSupabaseMiddlewareClient } from "@/lib/supabase/middleware";

const AUTH_ROUTES = new Set([
  "/auth/login",
  "/auth/register",
  "/auth/forgot-password",
  "/auth/error",
  "/auth/success",
]);

const CUSTOMER_PREFIX = "/customer";
const SELLER_PREFIX = "/seller";
const ADMIN_PREFIX = "/admin";

function routeForRole(role: string | null): string | null {
  if (role === "customer") return "/customer/dashboard";
  if (role === "seller") return "/seller/dashboard";
  if (role === "admin") return "/admin/dashboard";
  return null;
}

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  const res = NextResponse.next();
  const supabase = createSupabaseMiddlewareClient(req, res);

  let user = null;
  const refreshToken = req.cookies.get("sb-refresh-token")?.value;
  if (refreshToken) {
    try {
      const {
        data: { user: supabaseUser },
      } = await supabase.auth.getUser();
      user = supabaseUser ?? null;
    } catch {
      user = null;
    }
  }

  if (!user) {
    const isProtected =
      pathname.startsWith(CUSTOMER_PREFIX) ||
      pathname.startsWith(SELLER_PREFIX) ||
      pathname.startsWith(ADMIN_PREFIX);

    if (isProtected) {
      const url = req.nextUrl.clone();
      url.pathname = "/auth/login";
      url.searchParams.set("error", "Please log in to continue.");
      return NextResponse.redirect(url);
    }

    return res;
  }

  // Logged in: prevent going back to auth pages.
  if (AUTH_ROUTES.has(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const role = profile?.role ?? null;
  const targetRoute = routeForRole(role);

  // Role-less user -> safety redirect.
  if (!targetRoute) {
    await supabase.auth.signOut();
    const url = req.nextUrl.clone();
    url.pathname = "/auth/login";
    url.searchParams.set("error", "Your account role is not set. Contact administrator.");
    return NextResponse.redirect(url);
  }

  // Generic routing landing.
  if (pathname === "/dashboard") {
    const url = req.nextUrl.clone();
    url.pathname = targetRoute;
    return NextResponse.redirect(url);
  }

  // Cross-role protection.
  if (role === "customer" && pathname.startsWith(SELLER_PREFIX)) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  if (role === "customer" && pathname.startsWith(ADMIN_PREFIX)) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  if (role === "seller" && pathname.startsWith(CUSTOMER_PREFIX)) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  if (role === "seller" && pathname.startsWith(ADMIN_PREFIX)) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  if (role === "admin" && (pathname.startsWith(CUSTOMER_PREFIX) || pathname.startsWith(SELLER_PREFIX))) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

