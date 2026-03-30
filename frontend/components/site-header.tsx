"use client";

import { ChevronDown, LogOut, Settings, ShoppingBag, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback } from "react";
import { useEffect, useRef, useState } from "react";
import { useCartItemCount } from "@/hooks/use-cart-item-count";
import { useMizaStoredUser } from "@/hooks/use-miza-stored-user";
import { clearClientAuthStorage } from "@/lib/auth/persist-client-session";
import { getAppName, cn } from "@/lib/utils";
import type { UserProfileMenuProps } from "@/types";

function navLinkClass(active?: boolean) {
    return cn(
        "rounded-sm px-2.5 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-(--foreground)/70 transition-colors hover:text-foreground",
        active && "text-(--accent)"
    );
}

function UserProfileMenu({ user, onLogout }: UserProfileMenuProps) {
    const detailsRef = useRef<HTMLDetailsElement | null>(null);
    const [open, setOpen] = useState(false);

    const close = useCallback(() => {
        setOpen(false);
    }, []);

    useEffect(() => {
        if (!open) {
            return;
        }

        const onPointerDown = (e: PointerEvent) => {
            const el = detailsRef.current;
            if (!el) {
                return;
            }
            if (e.target instanceof Node && el.contains(e.target)) {
                return;
            }
            close();
        };

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                close();
            }
        };

        // PointerEvent covers both mouse and touch; we only close on the first outside click.
        window.addEventListener("pointerdown", onPointerDown, { capture: true });
        window.addEventListener("keydown", onKeyDown);
        return () => {
            window.removeEventListener("pointerdown", onPointerDown, { capture: true });
            window.removeEventListener("keydown", onKeyDown);
        };
    }, [open, close]);

    return (
        <details
            ref={detailsRef}
            className="relative group"
            open={open}
            onToggle={(e) => {
                const target = e.currentTarget as HTMLDetailsElement;
                setOpen(target.open);
            }}
        >
                <summary
                    className="flex cursor-pointer list-none items-center gap-2 rounded-full border border-(--border) bg-(--surface-elevated) px-3 py-2 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-(--surface) focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--accent)/30 [&::-webkit-details-marker]:hidden"
                    aria-label="Account menu"
                    aria-haspopup="menu"
                    aria-expanded={open}
                >
                    <span className="flex h-7 w-7 items-center justify-center rounded-full border border-(--border)/70 bg-[#080b10]">
                        <User className="h-4 w-4 text-(--muted)" aria-hidden />
                    </span>
                    <ChevronDown
                        className={cn("h-4 w-4 text-(--muted) transition-transform", open && "rotate-180")}
                        aria-hidden
                    />
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
                </div>
                {user.role === "seller" ? (
                    <Link
                        href="/seller/profile"
                        className="flex items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-foreground/90 hover:bg-(--surface-elevated)"
                        role="menuitem"
                        onClick={() => close()}
                    >
                        <Settings className="h-4 w-4 shrink-0 text-(--muted)" aria-hidden />
                        Settings
                    </Link>
                ) : null}
                {user.role === "buyer" ? (
                    <Link
                        href="/buyer/settings"
                        className="flex items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-foreground/90 hover:bg-(--surface-elevated)"
                        role="menuitem"
                        onClick={() => close()}
                    >
                        <Settings className="h-4 w-4 shrink-0 text-(--muted)" aria-hidden />
                        Account settings
                    </Link>
                ) : null}
                <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-foreground/90 hover:bg-(--surface-elevated)"
                    onClick={() => {
                        void onLogout();
                        close();
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

export function SiteHeader() {
    const pathname = usePathname();
    const { user, refresh } = useMizaStoredUser();

    const handleLogout = useCallback(async () => {
        clearClientAuthStorage();
        try {
            await fetch("/api/auth/session", { method: "DELETE" });
        } catch {
            /* ignore */
        }
        refresh();
        window.location.href = "/";
    }, [refresh]);

    const appName = getAppName();
    const showCart = user?.role !== "seller" && user?.role !== "admin";
    const cartCount = useCartItemCount(showCart);

    return (
        <header
            className="sticky top-0 z-50 border-b border-white/6 bg-[#10131a]/88 text-foreground backdrop-blur-xl backdrop-saturate-150"
            suppressHydrationWarning
        >
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
                    {user?.role === "buyer" ? (
                        <>
                            <Link
                                href="/buyer/orders"
                                className={navLinkClass(pathname.startsWith("/buyer/orders"))}
                            >
                                My orders
                            </Link>
                            <Link
                                href="/buyer/reviews"
                                className={navLinkClass(pathname.startsWith("/buyer/reviews"))}
                            >
                                My reviews
                            </Link>
                            <Link
                                href="/buyer/messages"
                                className={navLinkClass(pathname.startsWith("/buyer/messages"))}
                            >
                                Messages
                            </Link>
                            <Link
                                href="/buyer/settings"
                                className={navLinkClass(pathname.startsWith("/buyer/settings"))}
                            >
                                Settings
                            </Link>
                            {showCart ? (
                                <Link
                                    href="/cart"
                                    className={cn(
                                        "relative inline-flex items-center justify-center rounded-sm p-2 transition-colors",
                                        pathname === "/cart"
                                            ? "text-(--accent)"
                                            : "text-(--foreground)/70 hover:text-foreground"
                                    )}
                                    aria-label={
                                        cartCount > 0
                                            ? `Cart, ${cartCount} item${cartCount === 1 ? "" : "s"}`
                                            : "Cart"
                                    }
                                >
                                    <ShoppingBag className="h-4.5 w-4.5 sm:h-5 sm:w-5" aria-hidden />
                                    {cartCount > 0 ? (
                                        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-(--accent) px-1 text-[9px] font-bold leading-none text-[#030608] sm:h-[18px] sm:min-w-[18px] sm:text-[10px]">
                                            {cartCount > 99 ? "99+" : cartCount}
                                        </span>
                                    ) : null}
                                </Link>
                            ) : null}
                        </>
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
                            <Link
                                href="/seller/messages"
                                className={navLinkClass(pathname.startsWith("/seller/messages"))}
                            >
                                Messages
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
                            {showCart ? (
                                <Link
                                    href="/cart"
                                    className={cn(
                                        "relative inline-flex items-center justify-center rounded-sm p-2 transition-colors",
                                        pathname === "/cart"
                                            ? "text-(--accent)"
                                            : "text-(--foreground)/70 hover:text-foreground"
                                    )}
                                    aria-label={
                                        cartCount > 0
                                            ? `Cart, ${cartCount} item${cartCount === 1 ? "" : "s"}`
                                            : "Cart"
                                    }
                                >
                                    <ShoppingBag className="h-4.5 w-4.5 sm:h-5 sm:w-5" aria-hidden />
                                    {cartCount > 0 ? (
                                        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-(--accent) px-1 text-[9px] font-bold leading-none text-[#030608] sm:h-[18px] sm:min-w-[18px] sm:text-[10px]">
                                            {cartCount > 99 ? "99+" : cartCount}
                                        </span>
                                    ) : null}
                                </Link>
                            ) : null}
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
