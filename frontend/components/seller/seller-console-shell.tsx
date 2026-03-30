"use client";

import {
    Bell,
    HelpCircle,
    LayoutDashboard,
    LogOut,
    MessageCircle,
    Package,
    ShoppingBag,
    Settings
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { clearClientAuthStorage } from "@/lib/auth/persist-client-session";
import { cn, getAppName } from "@/lib/utils";
import type { AuthUser, SellerConsoleShellProps } from "@/types";

const navItems = [
    {
        href: "/seller/dashboard",
        label: "Dashboard",
        key: "dashboard" as const,
        icon: LayoutDashboard
    },
    { href: "/seller/listings", label: "Products", key: "products" as const, icon: Package },
    { href: "/seller/orders", label: "Orders", key: "orders" as const, icon: ShoppingBag },
    { href: "/seller/messages", label: "Messages", key: "messages" as const, icon: MessageCircle },
    { href: "/seller/profile", label: "Settings", key: "profile" as const, icon: Settings }
] as const;

function initialsFromUser(user: AuthUser | null): string {
    if (!user) return "SE";
    const base = user.fullName?.trim() || user.email?.split("@")[0] || "?";
    const parts = base.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
        return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
    }
    return base.slice(0, 2).toUpperCase();
}

export function SellerConsoleShell({ children, activeNav, sectionTitle }: SellerConsoleShellProps) {
    const appName = getAppName();
    const [user, setUser] = useState<AuthUser | null>(null);

    useEffect(() => {
        let cancelled = false;
        void Promise.resolve().then(() => {
            if (cancelled) return;
            try {
                const raw = window.localStorage.getItem("miza_user");
                if (!raw) {
                    setUser(null);
                    return;
                }
                setUser(JSON.parse(raw) as AuthUser);
            } catch {
                setUser(null);
            }
        });
        return () => {
            cancelled = true;
        };
    }, []);

    const handleLogout = useCallback(async () => {
        clearClientAuthStorage();
        try {
            await fetch("/api/auth/session", { method: "DELETE" });
        } catch {
            /* ignore */
        }
        window.location.href = "/";
    }, []);

    const displayName = user?.fullName?.trim() || user?.email || "Seller";

    return (
        <div className="flex h-full min-h-0 overflow-hidden bg-(--background) text-foreground">
            <aside className="hidden h-full min-h-0 w-56 shrink-0 flex-col border-r border-(--border) bg-[#0b0e14] lg:flex">
                <div className="shrink-0 border-b border-(--border) px-5 py-6">
                    <p className="text-lg font-semibold tracking-tight text-foreground">{appName}</p>
                    <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-(--accent)">
                        Verified seller
                    </p>
                </div>
                <nav
                    className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-y-contain p-3"
                    aria-label="Seller navigation"
                >
                    {navItems.map((item) => {
                        const Icon = item.icon;
                        const highlight = item.key === activeNav;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={cn(
                                    "flex items-center gap-3 rounded-md py-2.5 pl-3 pr-3 text-sm font-medium transition-colors",
                                    highlight
                                        ? "border-l-2 border-(--accent) bg-(--accent)/10 text-(--accent)"
                                        : "border-l-2 border-transparent text-(--muted) hover:bg-(--surface-elevated) hover:text-foreground"
                                )}
                            >
                                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                                {item.label}
                            </Link>
                        );
                    })}
                </nav>
                <div className="mt-auto shrink-0 border-t border-(--border) p-4">
                    <div className="flex items-center gap-3 rounded-md border border-(--border) bg-(--surface) p-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-(--accent)/20 text-xs font-bold text-(--accent)">
                            {initialsFromUser(user)}
                        </div>
                        <div className="min-w-0">
                            <p className="truncate text-xs font-medium text-foreground">
                                {displayName}
                            </p>
                            <p className="truncate text-[10px] uppercase tracking-wider text-(--muted)">
                                Seller account
                            </p>
                        </div>
                    </div>
                </div>
            </aside>

            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-white/[0.06] bg-[#10131a]/92 px-4 backdrop-blur-xl md:px-6">
                    <div className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                        <span className="shrink-0 truncate font-semibold text-(--accent)">{appName}</span>
                        <span className="shrink-0 text-(--border)">|</span>
                        <span className="truncate text-(--muted)">{sectionTitle}</span>
                    </div>
                    <div className="hidden items-center gap-1 sm:flex">
                        <button
                            type="button"
                            aria-label="Notifications"
                            className="rounded-md p-2 text-(--muted) transition-colors hover:bg-(--surface-elevated) hover:text-foreground"
                        >
                            <Bell className="h-4 w-4" aria-hidden />
                        </button>
                        <button
                            type="button"
                            aria-label="Help"
                            className="rounded-md p-2 text-(--muted) transition-colors hover:bg-(--surface-elevated) hover:text-foreground"
                        >
                            <HelpCircle className="h-4 w-4" aria-hidden />
                        </button>
                    </div>

                    <button
                        type="button"
                        aria-label="Log out"
                        onClick={() => void handleLogout()}
                        className="flex shrink-0 items-center gap-2 rounded-md border border-(--border) bg-transparent px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-(--muted) transition-colors hover:border-(--accent)/40 hover:text-(--accent)"
                    >
                        <LogOut className="h-4 w-4 shrink-0" aria-hidden />
                        <span className="hidden sm:inline">Log out</span>
                    </button>
                </header>

                <nav
                    className="flex shrink-0 gap-1 border-b border-(--border) bg-[#0b0e14] px-2 py-2 lg:hidden"
                    aria-label="Seller sections"
                >
                    {navItems.map((item) => {
                        const Icon = item.icon;
                        const on = item.key === activeNav;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={cn(
                                    "flex flex-1 flex-col items-center justify-center gap-0.5 rounded-md py-2 text-[10px] font-medium leading-tight",
                                    on ? "bg-(--accent)/15 text-(--accent)" : "text-(--muted)"
                                )}
                            >
                                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                                <span className="line-clamp-2 text-center">{item.label}</span>
                            </Link>
                        );
                    })}
                </nav>

                <main className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
                    {children}
                </main>
            </div>
        </div>
    );
}
