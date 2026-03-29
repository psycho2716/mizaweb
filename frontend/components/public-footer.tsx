"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useMizaStoredUser } from "@/hooks/use-miza-stored-user";
import { getAppName } from "@/lib/utils";
import type { AuthUser } from "@/types";

const footerNavigationGuest = [
    { label: "Marketplace", href: "/products" },
    { label: "Become a Seller", href: "/auth/register" },
    { label: "Login", href: "/auth/login" }
] as const;

function footerLinksForUser(user: AuthUser): { label: string; href: string }[] {
    if (user.role === "buyer") {
        return [
            { label: "Marketplace", href: "/products" },
            { label: "My orders", href: "/buyer/orders" },
            { label: "Messages", href: "/buyer/messages" }
        ];
    }
    if (user.role === "seller") {
        return [
            { label: "Dashboard", href: "/seller/dashboard" },
            { label: "Manage products", href: "/seller/listings" },
            { label: "Orders", href: "/seller/orders" }
        ];
    }
    return [
        { label: "Admin", href: "/admin/verifications" },
        { label: "Marketplace", href: "/products" }
    ];
}

export function PublicFooter() {
    const appName = getAppName();
    const { user } = useMizaStoredUser();

    const footerNavigation = useMemo(
        () => (user ? footerLinksForUser(user) : [...footerNavigationGuest]),
        [user]
    );

    return (
        <footer className="mt-auto border-t border-white/[0.06] bg-[#0b0e14]/90 backdrop-blur-sm">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
                <div className="grid gap-8 md:grid-cols-3">
                    <div className="space-y-2">
                        <p className="text-xl font-semibold tracking-wide text-foreground">
                            {appName}
                        </p>
                        <p className="max-w-xs text-sm leading-relaxed text-(--muted)">
                            Hand-finished stone goods—sculptures, kitchen pieces, décor, and
                            accessories—from verified Romblomanon artisans. Shop products, message
                            sellers, and checkout in one place.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-(--muted)">
                            Navigation
                        </p>
                        <ul className="space-y-1.5 text-sm">
                            {footerNavigation.map((item) => (
                                <li key={`${item.label}-${item.href}`}>
                                    <Link
                                        href={item.href}
                                        className="text-(--foreground)/90 transition-colors hover:text-(--accent)"
                                    >
                                        {item.label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-(--muted)">
                            Contact
                        </p>
                        <p className="text-sm text-(--foreground)/90">support@mizaweb.app</p>
                        {/* <p className="text-sm text-(--muted)">Mon-Fri, 9:00-18:00</p> */}
                    </div>
                </div>

                <div className="border-t border-(--border) pt-4 text-xs text-(--muted)">
                    © {new Date().getFullYear()} {appName}. All rights reserved.
                </div>
            </div>
        </footer>
    );
}
