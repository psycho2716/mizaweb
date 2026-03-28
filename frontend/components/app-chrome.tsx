"use client";

import { usePathname } from "next/navigation";
import { PublicFooter } from "@/components/public-footer";
import { SiteHeader } from "@/components/site-header";

export function AppChrome({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isAuthRoute = pathname.startsWith("/auth");
    const isAdminRoute = pathname.startsWith("/admin");

    if (isAuthRoute || isAdminRoute) {
        return <>{children}</>;
    }

    return (
        <>
            <SiteHeader />
            {children}
            <PublicFooter />
        </>
    );
}
