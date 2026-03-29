"use client";

import Link from "next/link";
import { useMizaStoredUser } from "@/hooks/use-miza-stored-user";

export function LandingGuestHeroSecondaryCta() {
    const { user } = useMizaStoredUser();
    if (user) {
        return null;
    }
    return (
        <Link
            href="/auth/register"
            className="rounded-sm border border-(--border) bg-black/20 px-5 py-2 text-xs font-semibold uppercase tracking-[0.13em] text-foreground transition hover:bg-(--surface-elevated)"
        >
            Start selling
        </Link>
    );
}

export function LandingGuestAudienceSection() {
    const { user } = useMizaStoredUser();
    if (user) {
        return null;
    }
    return (
        <section className="grid gap-4 md:grid-cols-2">
            <article className="rounded-sm border border-(--border) bg-(--surface) p-8">
                <h3 className="text-3xl font-semibold text-foreground">For buyers</h3>
                <p className="mt-3 max-w-sm text-sm leading-7 text-(--muted)">
                    Discover stone décor, gifts, and everyday pieces, compare prices in ₱, and order
                    from verified sellers with order tracking and chat.
                </p>
                <Link
                    href="/products"
                    className="mt-5 inline-block text-xs font-semibold uppercase tracking-[0.14em] text-(--accent)"
                >
                    Explore products →
                </Link>
            </article>
            <article className="rounded-sm border border-(--border) bg-(--surface) p-8">
                <h3 className="text-3xl font-semibold text-foreground">For sellers</h3>
                <p className="mt-3 max-w-sm text-sm leading-7 text-(--muted)">
                    List stone goods, manage orders and payouts, and talk to buyers from one merchant
                    workspace.
                </p>
                <Link
                    href="/auth/register"
                    className="mt-5 inline-block text-xs font-semibold uppercase tracking-[0.14em] text-(--accent)"
                >
                    Create seller account →
                </Link>
            </article>
        </section>
    );
}
