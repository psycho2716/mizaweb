"use client";

import Link from "next/link";
import { ChevronRight, Package, Sparkles, Truck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
    getOrders,
    getSellerAnalytics,
    getSellerProductDetail,
    getSellerProducts
} from "@/lib/api/endpoints";
import { cn, formatPeso } from "@/lib/utils";
import type { Order, ProductDetail, SellerAnalytics } from "@/types";

const linkCyan = "text-xs font-semibold text-(--accent) hover:underline";

function formatRelativeShort(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    const diff = Date.now() - d.getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "Just now";
    if (m < 60) return `${m} min ago`;
    const h = Math.floor(m / 60);
    if (h < 48) return `${h} hr ago`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function orderStatusPresentation(status: Order["status"]): { label: string; className: string } {
    switch (status) {
        case "created":
            return {
                label: "HOLD",
                className: "border border-red-500/35 bg-red-500/10 text-red-300"
            };
        case "confirmed":
        case "processing":
            return {
                label: "TRANSIT",
                className: "border border-emerald-500/35 bg-emerald-500/10 text-emerald-300"
            };
        case "shipped":
            return {
                label: "DEPARTED",
                className: "border border-(--accent)/35 bg-(--accent)/10 text-(--accent)"
            };
        case "delivered":
            return {
                label: "DELIVERED",
                className: "border border-emerald-600/30 bg-emerald-600/10 text-emerald-200"
            };
        case "cancelled":
            return {
                label: "CANCELLED",
                className: "border border-red-500/40 bg-red-500/15 text-red-200"
            };
    }
}

function downloadSellerReportCsv(analytics: SellerAnalytics, orderCount: number): void {
    const rows: [string, string][] = [
        ["monthlyRevenue", String(analytics.monthlyRevenue)],
        ["pendingOrders", String(analytics.pendingOrders)],
        ["toShipOrders", String(analytics.toShipOrders)],
        ["deliveredOrders", String(analytics.deliveredOrders)],
        ["unpaidOnlineOrders", String(analytics.unpaidOnlineOrders)],
        ["totalProducts", String(analytics.totalProducts)],
        ["publishedProducts", String(analytics.publishedProducts)],
        ["orders_in_this_export", String(orderCount)]
    ];
    const csv = ["metric,value", ...rows.map(([k, v]) => `${k},${v}`)].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `seller-summary-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

export default function SellerDashboardPage() {
    const [analytics, setAnalytics] = useState<SellerAnalytics | null>(null);
    const [orders, setOrders] = useState<Order[]>([]);
    const [spotlight, setSpotlight] = useState<ProductDetail | null>(null);
    const [loadError, setLoadError] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoadError(false);
            setLoading(true);
            try {
                const [aRes, oRes, pRes] = await Promise.all([
                    getSellerAnalytics(),
                    getOrders(),
                    getSellerProducts()
                ]);
                if (cancelled) return;
                setAnalytics(aRes.data);
                setOrders(oRes.data ?? []);
                const products = pRes.data ?? [];
                const pick = products.find((p) => p.isPublished) ?? products[0];
                if (pick) {
                    const det = await getSellerProductDetail(pick.id);
                    if (!cancelled) setSpotlight(det.data);
                } else {
                    setSpotlight(null);
                }
            } catch {
                if (!cancelled) {
                    setLoadError(true);
                    setAnalytics(null);
                    setOrders([]);
                    setSpotlight(null);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        void load();
        return () => {
            cancelled = true;
        };
    }, []);

    const pulseOrders = useMemo(() => {
        return [...orders]
            .sort((x, y) => new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime())
            .slice(0, 6);
    }, [orders]);

    const unpaidOnlineList = useMemo(() => {
        return [...orders]
            .filter((o) => o.paymentMethod === "online" && o.paymentStatus === "pending")
            .sort((x, y) => new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime())
            .slice(0, 5);
    }, [orders]);

    const catalogPct =
        analytics && analytics.totalProducts > 0
            ? Math.round((analytics.publishedProducts / analytics.totalProducts) * 100)
            : 0;

    const activePipeline =
        analytics !== null ? analytics.pendingOrders + analytics.toShipOrders : 0;

    return (
        <div className="p-4 md:p-6 md:py-4 lg:p-8 lg:py-4">
            <div className="flex flex-col gap-4 border-b border-(--border) pb-6 md:flex-row md:items-end md:justify-between">
                <div>
                    <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                        Dashboard
                    </h1>
                    <p className="mt-2 max-w-xl text-sm text-(--muted)">
                        See your sales, open orders, and products at a glance.
                    </p>
                </div>
                <div className="flex flex-wrap gap-3">
                    <Link
                        href="/seller/listings"
                        className="inline-flex items-center justify-center rounded-md bg-(--accent) px-4 py-2.5 text-sm font-semibold text-[#0b0e14] shadow-[0_0_24px_rgba(34,199,243,0.25)] transition hover:brightness-110"
                    >
                        Add a product
                    </Link>
                    {/* <button
                        type="button"
                        disabled={!analytics}
                        onClick={() => {
                            if (analytics) downloadSellerReportCsv(analytics, orders.length);
                        }}
                        className="inline-flex items-center justify-center rounded-md border border-white/20 bg-transparent px-4 py-2.5 text-sm font-semibold text-foreground transition hover:border-(--accent)/50 hover:text-(--accent) disabled:pointer-events-none disabled:opacity-40"
                    >
                        Download summary
                    </button> */}
                </div>
            </div>

            {loadError && (
                <p className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                    Could not load dashboard data. Refresh the page or try again shortly.
                </p>
            )}

            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-lg border border-(--border) bg-[#0b0e14] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-(--muted)">
                        Total revenue
                    </p>
                    <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
                        {loading ? "—" : formatPeso(analytics?.monthlyRevenue ?? 0)}
                    </p>
                    <p className="mt-1 text-[10px] font-medium tracking-wide text-emerald-400/90">
                        This month
                    </p>
                </div>
                <div className="rounded-lg border border-(--border) bg-[#0b0e14] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    <p className="text-[10px] font-semibold tracking-wide text-(--muted)">
                        Active orders
                    </p>
                    <p className="mt-2 text-2xl font-semibold tabular-nums text-(--accent)">
                        {loading ? "—" : activePipeline}
                    </p>
                    <p className="mt-1 text-[10px] text-(--muted)">
                        {loading
                            ? "—"
                            : `${analytics?.pendingOrders ?? 0} pending · ${analytics?.toShipOrders ?? 0} to ship`}
                    </p>
                </div>
                <div className="rounded-lg border border-(--border) bg-[#0b0e14] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    <p className="text-[10px] font-semibold tracking-wide text-(--muted)">
                        Completed
                    </p>
                    <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
                        {loading ? "—" : (analytics?.deliveredOrders ?? 0)}
                    </p>
                    <p className="mt-1 text-[10px] text-(--muted)">Completed orders, all time</p>
                </div>
                <div className="rounded-lg border border-(--border) bg-[#0b0e14] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    <p className="text-[10px] font-semibold tracking-wide text-(--muted)">
                        On your storefront
                    </p>
                    <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                        <div
                            className="h-full rounded-full bg-(--accent) transition-[width] duration-500"
                            style={{ width: loading ? "0%" : `${catalogPct}%` }}
                        />
                    </div>
                    <p className="mt-2 text-[10px] font-semibold tracking-wide text-(--accent)">
                        {loading
                            ? "—"
                            : `${catalogPct}% live · ${analytics?.publishedProducts ?? 0} of ${analytics?.totalProducts ?? 0} products`}
                    </p>
                </div>
            </div>

            <div className="mt-8 grid gap-6 lg:grid-cols-12">
                <div className="space-y-6 lg:col-span-8">
                    <section className="rounded-lg border border-(--border) bg-[#0b0e14] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                        <div className="flex items-center justify-between gap-3 border-b border-(--border) pb-4">
                            <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">
                                Recent orders
                            </h2>
                            <Link href="/seller/orders" className={linkCyan}>
                                View all orders →
                            </Link>
                        </div>
                        <ul className="mt-4 space-y-2">
                            {loading && (
                                <li className="rounded-md border border-(--border) bg-black/20 px-3 py-4 text-sm text-(--muted)">
                                    Loading orders…
                                </li>
                            )}
                            {!loading && pulseOrders.length === 0 && (
                                <li className="rounded-md border border-dashed border-(--border) px-3 py-6 text-center text-sm text-(--muted)">
                                    No orders yet. When someone buys from you, their orders will
                                    show up here.
                                </li>
                            )}
                            {!loading &&
                                pulseOrders.map((order, i) => {
                                    const { label, className } = orderStatusPresentation(
                                        order.status
                                    );
                                    const Icon = i % 2 === 0 ? Truck : Package;
                                    return (
                                        <li
                                            key={order.id}
                                            className="flex items-center gap-3 rounded-md border border-(--border) bg-black/25 px-3 py-3"
                                        >
                                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-(--border) bg-black/40 text-(--muted)">
                                                <Icon className="h-4 w-4" aria-hidden />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-[11px] font-semibold tracking-wide text-(--muted)">
                                                    Order · {order.id.slice(0, 8)}…
                                                </p>
                                                <p className="truncate text-sm text-foreground">
                                                    {formatPeso(order.totalAmount)} ·{" "}
                                                    {order.paymentMethod === "online"
                                                        ? "Online"
                                                        : "Cash"}{" "}
                                                    · {formatRelativeShort(order.createdAt)}
                                                </p>
                                            </div>
                                            <span
                                                className={cn(
                                                    "shrink-0 rounded px-2 py-1 text-[10px] font-semibold tracking-wide",
                                                    className
                                                )}
                                            >
                                                {label}
                                            </span>
                                        </li>
                                    );
                                })}
                        </ul>
                    </section>

                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="overflow-hidden rounded-lg border border-(--border) bg-[#0b0e14] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                            <div className="relative aspect-[4/3] bg-gradient-to-br from-zinc-900 via-black to-zinc-800">
                                {spotlight?.media?.[0]?.url ? (
                                    // eslint-disable-next-line @next/next/no-img-element -- remote seller URLs vary; avoid image domain config
                                    <img
                                        src={spotlight.media[0].url}
                                        alt=""
                                        className="h-full w-full object-cover opacity-90"
                                    />
                                ) : (
                                    <div className="flex h-full items-center justify-center text-xs text-(--muted)">
                                        No photo yet
                                    </div>
                                )}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                                <div className="absolute bottom-0 left-0 right-0 p-4">
                                    <p className="text-[10px] font-semibold tracking-wide text-(--accent)">
                                        Featured product
                                    </p>
                                    <p className="mt-1 line-clamp-2 text-lg font-semibold text-white">
                                        {spotlight?.title ?? "Add your first product"}
                                    </p>
                                    {spotlight && (
                                        <Link
                                            href={`/seller/listings?edit=${encodeURIComponent(spotlight.id)}`}
                                            className="mt-2 inline-block text-xs font-semibold text-(--accent) hover:underline"
                                        >
                                            Edit product →
                                        </Link>
                                    )}
                                    {!spotlight && !loading && (
                                        <Link
                                            href="/seller/listings"
                                            className="mt-2 inline-block text-xs font-semibold text-(--accent) hover:underline"
                                        >
                                            Open products →
                                        </Link>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="flex flex-col justify-between rounded-lg border border-(--border) bg-[#0b0e14] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                            <div>
                                <div className="flex h-10 w-10 items-center justify-center rounded border border-(--border) bg-black/30 text-(--accent)">
                                    <Sparkles className="h-5 w-5" aria-hidden />
                                </div>
                                <h3 className="mt-4 text-sm font-semibold tracking-tight text-foreground">
                                    Stronger listings
                                </h3>
                                <p className="mt-2 text-sm leading-relaxed text-(--muted)">
                                    Publish your drafts and add clear photos so customers know what
                                    they&apos;re buying.
                                </p>
                            </div>
                            <Link
                                href="/seller/listings"
                                className={`mt-6 inline-flex ${linkCyan}`}
                            >
                                Go to products →
                            </Link>
                        </div>
                    </div>
                </div>

                <aside className="space-y-6 lg:col-span-4">
                    <section className="rounded-lg border border-(--border) bg-[#0b0e14] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                        <h2 className="text-sm font-semibold tracking-tight text-foreground">
                            Online payments
                        </h2>
                        <ul className="mt-4 space-y-4">
                            {!loading &&
                                unpaidOnlineList.map((order) => (
                                    <li
                                        key={`pay-${order.id}`}
                                        className="border-b border-(--border) pb-4 last:border-0 last:pb-0"
                                    >
                                        <p className="text-[10px] font-semibold tracking-wide text-(--muted)">
                                            Online order · {formatRelativeShort(order.createdAt)}
                                        </p>
                                        <p className="mt-1 text-sm text-foreground">
                                            {formatPeso(order.totalAmount)} — confirm when
                                            you&apos;ve received the payment
                                        </p>
                                        <Link
                                            href={`/seller/orders/${encodeURIComponent(order.id)}`}
                                            className="mt-2 inline-block text-[10px] font-semibold text-(--accent) hover:underline"
                                        >
                                            Review order →
                                        </Link>
                                    </li>
                                ))}
                            {!loading &&
                                (analytics?.unpaidOnlineOrders ?? 0) === 0 &&
                                unpaidOnlineList.length === 0 && (
                                    <li className="text-sm text-(--muted)">
                                        No online orders are waiting for payment confirmation. Cash
                                        orders still show under Orders.
                                    </li>
                                )}
                            {!loading &&
                                (analytics?.unpaidOnlineOrders ?? 0) > 0 &&
                                unpaidOnlineList.length === 0 && (
                                    <li className="text-sm text-(--muted)">
                                        {analytics?.unpaidOnlineOrders ?? 0} online order
                                        {(analytics?.unpaidOnlineOrders ?? 0) === 1
                                            ? " is"
                                            : "s are"}{" "}
                                        waiting for payment confirmation — open{" "}
                                        <Link
                                            href="/seller/orders"
                                            className="text-(--accent) underline-offset-2 hover:underline"
                                        >
                                            Orders
                                        </Link>{" "}
                                        to review.
                                    </li>
                                )}
                            {loading && <li className="text-sm text-(--muted)">Loading…</li>}
                        </ul>
                    </section>

                    <section className="rounded-lg border border-(--border) bg-[#0b0e14] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                        <h2 className="text-sm font-semibold tracking-tight text-foreground">
                            Shortcuts
                        </h2>
                        <ul className="mt-4 space-y-1">
                            {[
                                { href: "/seller/orders", label: "Orders" },
                                { href: "/seller/listings", label: "Products" },
                                { href: "/seller/profile", label: "Profile & payouts" }
                            ].map((item) => (
                                <li key={item.href}>
                                    <Link
                                        href={item.href}
                                        className="flex items-center justify-between rounded-md px-2 py-2.5 text-sm text-(--muted) transition hover:bg-white/5 hover:text-foreground"
                                    >
                                        <span>{item.label}</span>
                                        <ChevronRight className="h-4 w-4 text-(--accent)" />
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </section>

                    <section className="rounded-lg border border-emerald-900/40 bg-emerald-950/20 p-5">
                        <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-100/90">
                            Overview
                        </h2>
                        <div className="mt-4 flex flex-wrap gap-2">
                            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[10px] font-semibold text-emerald-200">
                                Live on store: {loading ? "—" : (analytics?.publishedProducts ?? 0)}
                            </span>
                            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[10px] font-semibold text-emerald-200">
                                All products: {loading ? "—" : (analytics?.totalProducts ?? 0)}
                            </span>
                            {(analytics?.unpaidOnlineOrders ?? 0) > 0 && (
                                <span className="rounded-full border border-amber-500/35 bg-amber-500/10 px-3 py-1 text-[10px] font-semibold text-amber-200">
                                    Awaiting payment: {analytics?.unpaidOnlineOrders ?? 0}
                                </span>
                            )}
                        </div>
                        <p className="mt-3 text-xs text-emerald-200/70">
                            If your account is being verified, you&apos;ll see a notice at the top
                            of the page.
                        </p>
                    </section>
                </aside>
            </div>
        </div>
    );
}
