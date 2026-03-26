import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

function getRoleRedirect(role: string): string {
  if (role === "admin") return "/admin/verifications";
  if (role === "seller") return "/seller/listings";
  if (role === "buyer") return "/buyer/orders";
  return "/products";
}

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const token = request.cookies.get("miza_token")?.value;
  const role = request.cookies.get("miza_role")?.value;

  const requiresAuth =
    pathname.startsWith("/seller") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/buyer");

  if (requiresAuth && !token) {
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }

  if (pathname.startsWith("/admin") && role !== "admin") {
    return NextResponse.redirect(new URL(getRoleRedirect(role ?? "buyer"), request.url));
  }

  if (pathname.startsWith("/seller") && role !== "seller") {
    return NextResponse.redirect(new URL(getRoleRedirect(role ?? "buyer"), request.url));
  }

  if ((pathname === "/auth/login" || pathname === "/auth/register") && token && role) {
    return NextResponse.redirect(new URL(getRoleRedirect(role), request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/auth/login", "/auth/register", "/seller/:path*", "/admin/:path*", "/buyer/:path*"],
};
