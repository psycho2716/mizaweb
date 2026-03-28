"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSellerAnalytics } from "@/lib/api/endpoints";
import type { SellerAnalytics } from "@/types";

const linkClass = "text-sm font-medium text-(--accent) underline-offset-4 hover:underline";

export default function SellerDashboardPage() {
    const [analytics, setAnalytics] = useState<SellerAnalytics | null>(null);

    useEffect(() => {
        getSellerAnalytics()
            .then((response) => setAnalytics(response.data))
            .catch(() => setAnalytics(null));
    }, []);

    const stats: { label: string; value: string | number }[] = [
        { label: "Monthly revenue", value: `PHP ${analytics?.monthlyRevenue ?? 0}` },
        { label: "Pending orders", value: analytics?.pendingOrders ?? 0 },
        { label: "To ship", value: analytics?.toShipOrders ?? 0 },
        { label: "Unpaid online orders", value: analytics?.unpaidOnlineOrders ?? 0 }
    ];

    return (
        <div className="p-4 md:p-6">
            <div className="mb-6">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--accent)">
                    Operations overview
                </p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
                    Dashboard
                </h1>
                <p className="mt-1 max-w-2xl text-sm text-(--muted)">
                    Real-time snapshot of revenue, fulfillment, and payments. Use the sidebar for
                    inventory and orders.
                </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {stats.map((item) => (
                    <div
                        key={item.label}
                        className="rounded-lg border border-(--border) bg-(--surface) p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                    >
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-(--muted)">
                            {item.label}
                        </p>
                        <p className="mt-2 text-2xl font-semibold tabular-nums text-(--accent)">
                            {item.value}
                        </p>
                    </div>
                ))}
            </div>

            <div className="mt-8 rounded-lg border border-(--border) bg-(--surface) p-5">
                <h2 className="border-l-2 border-(--accent) pl-3 text-sm font-semibold uppercase tracking-wide text-foreground">
                    Quick links
                </h2>
                <ul className="mt-4 grid gap-2 text-sm text-(--muted) sm:grid-cols-2">
                    <li>
                        <Link href="/seller/listings" className={linkClass}>
                            Stone products — manage products
                        </Link>
                    </li>
                    <li>
                        <Link href="/seller/orders" className={linkClass}>
                            Order management
                        </Link>
                    </li>
                    <li>
                        <Link href="/seller/profile" className={linkClass}>
                            Profile &amp; payouts
                        </Link>
                    </li>
                </ul>
                <p className="mt-4 text-xs text-(--muted)">
                    Verification status appears in the banner above when your account is not yet
                    approved.
                </p>
            </div>
        </div>
    );
}
