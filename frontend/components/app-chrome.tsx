"use client";

import { useEffect, useLayoutEffect } from "react";
import { usePathname } from "next/navigation";
import { PublicFooter } from "@/components/public-footer";
import { SiteHeader } from "@/components/site-header";
import { syncMizaSessionCookieFromStorage } from "@/lib/auth/sync-session-from-storage";

export function AppChrome({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();

    useLayoutEffect(() => {
        syncMizaSessionCookieFromStorage();
    }, [pathname]);

    useEffect(() => {
        const onAuth = () => syncMizaSessionCookieFromStorage();
        window.addEventListener("miza-auth-change", onAuth);
        return () => window.removeEventListener("miza-auth-change", onAuth);
    }, []);
    const isAuthRoute = pathname.startsWith("/auth");
    const isAdminRoute = pathname.startsWith("/admin");
    /** Seller dashboard/console (`/seller/...`), not public shop pages (`/sellers/...`). */
    const isSellerConsoleRoute = pathname === "/seller" || pathname.startsWith("/seller/");

    if (isAuthRoute || isAdminRoute) {
        return <>{children}</>;
    }

    if (isSellerConsoleRoute) {
        return <div className="mizaweb-stitch-app">{children}</div>;
    }

    const isBuyerOrderSuccessRoute = pathname.startsWith("/buyer/orders/success");
    const isBuyerOrdersListRoute = pathname === "/buyer/orders";
    const isBuyerReviewsRoute = pathname.startsWith("/buyer/reviews");

    return (
        <div className="mizaweb-stitch-app">
            <SiteHeader />
            <div className="flex flex-1 flex-col">{children}</div>
            {!isBuyerOrderSuccessRoute &&
            !isBuyerOrdersListRoute &&
            !isBuyerReviewsRoute ? (
                <PublicFooter />
            ) : null}
        </div>
    );
}
