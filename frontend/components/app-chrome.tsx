"use client";

import { usePathname } from "next/navigation";
import { PublicFooter } from "@/components/public-footer";
import { SiteHeader } from "@/components/site-header";

export function AppChrome({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isAuthRoute = pathname.startsWith("/auth");
    const isAdminRoute = pathname.startsWith("/admin");
    const isSellerRoute = pathname.startsWith("/seller");

    if (isAuthRoute || isAdminRoute) {
        return <>{children}</>;
    }

    if (isSellerRoute) {
        return <div className="mizaweb-stitch-app">{children}</div>;
    }

    return (
        <div className="mizaweb-stitch-app">
            <SiteHeader />
            <div className="flex flex-1 flex-col">{children}</div>
            <PublicFooter />
        </div>
    );
}
