"use client";

import { ClipboardCheck, LogOut, MapPin, Users } from "lucide-react";
import Link from "next/link";
import { useCallback } from "react";
import { clearClientAuthStorage } from "@/lib/auth/persist-client-session";
import { cn, getAppName } from "@/lib/utils";
import type { AdminConsoleShellProps } from "@/types";

const navItems = [
  { href: "/admin/verifications", label: "Seller approvals", key: "verifications" as const, icon: ClipboardCheck },
  {
    href: "/admin/location-requests",
    label: "Shop locations",
    key: "location-requests" as const,
    icon: MapPin
  },
  { href: "/admin/users", label: "Users", key: "users" as const, icon: Users }
] as const;

export function AdminConsoleShell({ children, activeNav = "verifications" }: AdminConsoleShellProps) {
  const appName = getAppName();

  const handleLogout = useCallback(async () => {
    clearClientAuthStorage();
    try {
      await fetch("/api/auth/session", { method: "DELETE" });
    } catch {
      /* ignore */
    }
    window.location.href = "/";
  }, []);

  return (
    <div className="flex h-dvh max-h-dvh min-h-0 overflow-hidden bg-[#0a0d12] text-foreground">
      <aside className="hidden h-full min-h-0 w-56 shrink-0 flex-col border-r border-(--border) bg-[#080b10] lg:flex">
        <div className="shrink-0 border-b border-(--border) px-5 py-6">
          <p className="text-lg font-semibold tracking-tight text-foreground">{appName}</p>
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-(--accent)">
            Admin
          </p>
        </div>
        <nav
          className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-y-contain p-3"
          aria-label="Admin navigation"
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const highlight = item.key === activeNav;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                  highlight
                    ? "bg-(--accent)/15 text-(--accent)"
                    : "text-(--muted) hover:bg-(--surface-elevated) hover:text-foreground"
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
              AD
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-foreground">Administrator</p>
              <p className="truncate text-[10px] uppercase tracking-wider text-(--muted)">Staff</p>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-(--border) bg-[#080b10]/95 px-4 backdrop-blur md:px-6">
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <span className="truncate font-medium text-foreground">
              {appName} Admin
            </span>
            <span className="text-(--border)">|</span>
            <span className="truncate text-(--accent)">
              {activeNav === "users"
                ? "Users"
                : activeNav === "location-requests"
                  ? "Shop locations"
                  : "Seller approvals"}
            </span>
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
          className="flex shrink-0 gap-1 border-b border-(--border) bg-[#080b10] px-2 py-2 lg:hidden"
          aria-label="Admin sections"
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const on = item.key === activeNav;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-xs font-medium",
                  on ? "bg-(--accent)/15 text-(--accent)" : "text-(--muted)"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <main className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">{children}</main>
      </div>
    </div>
  );
}
