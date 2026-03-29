import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

function getRoleRedirect(role: string): string {
    if (role === "admin") {
        return "/admin/verifications";
    }
    if (role === "seller") {
        return "/seller/dashboard";
    }
    if (role === "buyer") {
        return "/buyer/orders";
    }
    return "/products";
}

/** Seller console only — must not match public `/sellers/...` storefronts. */
function isSellerConsolePath(pathname: string): boolean {
    return pathname === "/seller" || pathname.startsWith("/seller/");
}

export function middleware(request: NextRequest) {
    const pathname = request.nextUrl.pathname;
    const token = request.cookies.get("miza_token")?.value;
    const role = request.cookies.get("miza_role")?.value;

    const requiresAuth =
        isSellerConsolePath(pathname) ||
        pathname.startsWith("/admin") ||
        pathname.startsWith("/buyer");

    if (requiresAuth && !token) {
        const login = new URL("/auth/login", request.url);
        const returnPath = `${pathname}${request.nextUrl.search}`;
        login.searchParams.set("callbackUrl", returnPath);
        return NextResponse.redirect(login);
    }

    if (pathname.startsWith("/admin") && role !== "admin") {
        return NextResponse.redirect(
            new URL(getRoleRedirect(role ?? "buyer"), request.url)
        );
    }

    if (isSellerConsolePath(pathname) && role !== "seller") {
        return NextResponse.redirect(
            new URL(getRoleRedirect(role ?? "buyer"), request.url)
        );
    }

    if (pathname.startsWith("/buyer") && role && role !== "buyer") {
        return NextResponse.redirect(new URL(getRoleRedirect(role), request.url));
    }

    if (pathname.startsWith("/auth/") && token && role) {
        return NextResponse.redirect(new URL(getRoleRedirect(role), request.url));
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        "/auth/:path*",
        "/seller",
        "/seller/:path*",
        "/admin/:path*",
        "/buyer/:path*"
    ]
};
