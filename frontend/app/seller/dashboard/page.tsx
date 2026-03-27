"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSellerAnalytics } from "@/lib/api/endpoints";
import type { SellerAnalytics } from "@/types";

const linkClass =
    "text-sm font-medium text-zinc-900 underline underline-offset-4 hover:text-zinc-700";

export default function SellerDashboardPage() {
    const [analytics, setAnalytics] = useState<SellerAnalytics | null>(null);

    useEffect(() => {
        getSellerAnalytics()
            .then((response) => setAnalytics(response.data))
            .catch(() => setAnalytics(null));
    }, []);

    return (
        <main className="mx-auto max-w-3xl p-6">
            <Card>
                <CardHeader>
                    <CardTitle>Seller dashboard</CardTitle>
                    <CardDescription>Overview and shortcuts to your seller tools.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 text-sm text-zinc-700">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-md border border-zinc-200 p-3">
                            <p className="text-xs text-zinc-500">Monthly revenue</p>
                            <p className="text-xl font-semibold text-zinc-900">
                                PHP {analytics?.monthlyRevenue ?? 0}
                            </p>
                        </div>
                        <div className="rounded-md border border-zinc-200 p-3">
                            <p className="text-xs text-zinc-500">Pending orders</p>
                            <p className="text-xl font-semibold text-zinc-900">
                                {analytics?.pendingOrders ?? 0}
                            </p>
                        </div>
                        <div className="rounded-md border border-zinc-200 p-3">
                            <p className="text-xs text-zinc-500">To ship</p>
                            <p className="text-xl font-semibold text-zinc-900">
                                {analytics?.toShipOrders ?? 0}
                            </p>
                        </div>
                        <div className="rounded-md border border-zinc-200 p-3">
                            <p className="text-xs text-zinc-500">Unpaid online orders</p>
                            <p className="text-xl font-semibold text-zinc-900">
                                {analytics?.unpaidOnlineOrders ?? 0}
                            </p>
                        </div>
                    </div>
                    <p>
                        Use the navigation bar to manage your store. Verification status appears as a
                        banner at the top of seller pages when your account is not yet approved.
                    </p>
                    <p className="text-zinc-600">Quick links:</p>
                    <ul className="list-inside list-disc space-y-1">
                        <li>
                            <Link href="/seller/listings" className={linkClass}>
                                Manage products
                            </Link>
                        </li>
                        <li>
                            <Link href="/seller/orders" className={linkClass}>
                                Orders
                            </Link>
                        </li>
                        <li>
                            <Link href="/seller/profile" className={linkClass}>
                                Profile
                            </Link>
                        </li>
                        <li>
                            <Link href="/seller/payment-methods" className={linkClass}>
                                Payment methods
                            </Link>
                        </li>
                    </ul>
                </CardContent>
            </Card>
        </main>
    );
}
