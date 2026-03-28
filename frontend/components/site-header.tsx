"use client";

import { ChevronDown, LogOut, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { getAppName, cn } from "@/lib/utils";
import type { AuthUser, UserProfileMenuProps } from "@/types";

function navLinkClass(active?: boolean) {
    return cn(
        "rounded-sm px-2.5 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-(--foreground)/70 transition-colors hover:text-foreground",
        active && "text-(--accent)"
    );
}

function UserProfileMenu({ user, onLogout }: UserProfileMenuProps) {
    return (
        <details className="relative group">
            <summary
                className="flex cursor-pointer list-none items-center gap-1.5 rounded-lg border border-(--border) bg-(--surface-elevated) px-2.5 py-1.5 text-sm font-medium text-foreground shadow-sm hover:bg-(--surface) [&::-webkit-details-marker]:hidden"
                aria-label="Account menu"
            >
                <User className="h-4 w-4 shrink-0 text-(--muted)" aria-hidden />
                {/* <span className="max-w-[140px] truncate">
                    {user.fullName?.trim() || user.email}
                </span> */}
                <ChevronDown className="h-4 w-4 shrink-0 text-(--muted)" aria-hidden />
            </summary>
            <div
                className="absolute right-0 top-[calc(100%+6px)] z-50 min-w-[220px] rounded-lg border border-(--border) bg-(--surface) py-1 shadow-lg"
                role="menu"
            >
                <div className="border-b border-(--border) px-3 py-2">
                    <p className="text-xs font-medium text-(--muted)">Signed in</p>
                    <p className="truncate text-sm font-semibold text-foreground">{user.email}</p>
                    {user.fullName ? (
                        <p className="truncate text-xs text-(--muted)">{user.fullName}</p>
                    ) : null}
                    <p className="mt-1 text-xs capitalize text-(--muted)">Role: {user.role}</p>
                </div>
                {user.role === "seller" ? (
                    <Link
                        href="/seller/profile"
                        className="block px-3 py-2.5 text-left text-sm font-medium text-(--foreground)/90 hover:bg-(--surface-elevated)"
                        role="menuitem"
                    >
                        Profile
                    </Link>
                ) : null}
                <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-(--foreground)/90 hover:bg-(--surface-elevated)"
                    onClick={() => {
                        void onLogout();
                    }}
                    role="menuitem"
                >
                    <LogOut className="h-4 w-4 shrink-0" aria-hidden />
                    Log out
                </button>
            </div>
        </details>
    );
}

function readStoredUser(): AuthUser | null {
    if (typeof window === "undefined") {
        return null;
    }
    try {
        const raw = window.localStorage.getItem("miza_user");
        if (!raw) {
            return null;
        }
        const parsed = JSON.parse(raw) as unknown;
        if (
            parsed &&
            typeof parsed === "object" &&
            "id" in parsed &&
            "email" in parsed &&
            "role" in parsed
        ) {
            return parsed as AuthUser;
        }
        return null;
    } catch {
        return null;
    }
}

export function SiteHeader() {
    const pathname = usePathname();
    const [user, setUser] = useState<AuthUser | null>(() => readStoredUser());

    const refreshUser = useCallback(() => {
        setUser(readStoredUser());
    }, []);

    useEffect(() => {
        function onStorage(e: StorageEvent) {
            if (e.key === "miza_user" || e.key === "miza_token") {
                refreshUser();
            }
        }
        function onAuthCustom() {
            refreshUser();
        }
        window.addEventListener("storage", onStorage);
        window.addEventListener("miza-auth-change", onAuthCustom);
        return () => {
            window.removeEventListener("storage", onStorage);
            window.removeEventListener("miza-auth-change", onAuthCustom);
        };
    }, [refreshUser]);

    const handleLogout = useCallback(async () => {
        window.localStorage.removeItem("miza_token");
        window.localStorage.removeItem("miza_user");
        try {
            await fetch("/api/auth/session", { method: "DELETE" });
        } catch {
            /* ignore */
        }
        setUser(null);
        window.location.href = "/";
    }, []);

    const appName = getAppName();
    const showCart = user?.role !== "seller" && user?.role !== "admin";

    return (
        <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#10131a]/88 text-foreground backdrop-blur-xl backdrop-saturate-150">
            <nav
                className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-6"
                aria-label="Main"
            >
                <Link
                    href="/"
                    className="text-[11px] font-bold uppercase tracking-[0.28em] text-foreground"
                >
                    {appName}
                </Link>
                <div className="flex flex-wrap items-center justify-end gap-x-1 gap-y-2 sm:gap-x-2">
                    {user?.role !== "seller" ? (
                        <Link
                            href="/products"
                            className={navLinkClass(pathname.startsWith("/products"))}
                        >
                            Products
                        </Link>
                    ) : null}
                    {showCart ? (
                        <Link href="/cart" className={navLinkClass(pathname === "/cart")}>
                            Cart
                        </Link>
                    ) : null}
                    {user?.role === "buyer" ? (
                        <Link
                            href="/buyer/orders"
                            className={navLinkClass(pathname.startsWith("/buyer"))}
                        >
                            My orders
                        </Link>
                    ) : null}
                    {user?.role === "seller" ? (
                        <>
                            <Link
                                href="/seller/dashboard"
                                className={navLinkClass(
                                    pathname === "/seller/dashboard" || pathname === "/seller"
                                )}
                            >
                                Dashboard
                            </Link>
                            <Link
                                href="/seller/listings"
                                className={navLinkClass(pathname.startsWith("/seller/listings"))}
                            >
                                Manage products
                            </Link>
                            <Link
                                href="/seller/orders"
                                className={navLinkClass(pathname.startsWith("/seller/orders"))}
                            >
                                Orders
                            </Link>
                        </>
                    ) : null}
                    {user?.role === "admin" ? (
                        <Link
                            href="/admin/verifications"
                            className={navLinkClass(pathname.startsWith("/admin"))}
                        >
                            Admin
                        </Link>
                    ) : null}
                    {!user ? (
                        <>
                            <Link
                                href="/auth/login"
                                className={navLinkClass(pathname === "/auth/login")}
                            >
                                Login
                            </Link>
                            <Link
                                href="/auth/register"
                                className={navLinkClass(pathname === "/auth/register")}
                            >
                                Register
                            </Link>
                        </>
                    ) : (
                        <UserProfileMenu user={user} onLogout={handleLogout} />
                    )}
                </div>
            </nav>
        </header>
    );
}
