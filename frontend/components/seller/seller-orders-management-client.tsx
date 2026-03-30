"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { getSellerOrdersSummary } from "@/lib/api/endpoints";
import { formatPeso, getAppName } from "@/lib/utils";
import type { Order, SellerOrderSummaryItem } from "@/types";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";
const PAGE_SIZE = 5;

type GroupFilter = "all" | "preparing" | "packing" | "on_the_way" | "received" | "cancelled";

function matchesGroup(row: SellerOrderSummaryItem, g: GroupFilter): boolean {
    if (g === "all") {
        return true;
    }
    if (g === "preparing") {
        return row.status === "created" || row.status === "confirmed";
    }
    if (g === "packing") {
        return row.status === "processing";
    }
    if (g === "on_the_way") {
        return row.status === "shipped";
    }
    if (g === "cancelled") {
        return row.status === "cancelled";
    }
    return row.status === "delivered";
}

function statusLabel(status: Order["status"]): string {
    switch (status) {
        case "created":
            return "Needs confirmation";
        case "confirmed":
            return "Confirmed";
        case "processing":
            return "Packing";
        case "shipped":
            return "On the way";
        case "delivered":
            return "Received";
        default:
            return status;
    }
}

function statusDotClass(status: Order["status"]): string {
    switch (status) {
        case "created":
            return "bg-(--accent)";
        case "confirmed":
        case "processing":
            return "bg-amber-400";
        case "shipped":
            return "bg-white/50";
        case "delivered":
            return "bg-emerald-500/80";
        case "cancelled":
            return "bg-red-500/70";
        default:
            return "bg-(--muted)";
    }
}

function formatTableDate(iso: string): string {
    return new Date(iso).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric"
    });
}

function pageWindow(current: number, total: number, width = 5): number[] {
    if (total <= width) {
        return Array.from({ length: total }, (_, i) => i + 1);
    }
    let start = Math.max(1, current - Math.floor(width / 2));
    const end = Math.min(total, start + width - 1);
    start = Math.max(1, end - width + 1);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

export function SellerOrdersManagementClient() {
    const appName = getAppName();
    const [rows, setRows] = useState<SellerOrderSummaryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [group, setGroup] = useState<GroupFilter>("all");
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);

    const loadRows = useCallback(async () => {
        setLoading(true);
        try {
            const res = await getSellerOrdersSummary();
            setRows(res.data);
        } catch {
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadRows();
    }, [loadRows]);

    useEffect(() => {
        const token = localStorage.getItem("miza_token");
        const rawUser = localStorage.getItem("miza_user");
        const user = rawUser ? (JSON.parse(rawUser) as { id: string }) : null;
        const socket: Socket = io(BACKEND_URL, { transports: ["websocket"] });
        if (user?.id) {
            socket.emit("join:channel", `user:${user.id}`);
        }
        socket.on("order:updated", () => {
            void loadRows();
        });
        if (!token) {
            socket.disconnect();
        }
        return () => {
            socket.disconnect();
        };
    }, [loadRows]);

    const counts = useMemo(() => {
        const c: Record<GroupFilter, number> = {
            all: rows.length,
            preparing: 0,
            packing: 0,
            on_the_way: 0,
            received: 0,
            cancelled: 0
        };
        for (const r of rows) {
            if (matchesGroup(r, "preparing")) {
                c.preparing += 1;
            }
            if (matchesGroup(r, "packing")) {
                c.packing += 1;
            }
            if (matchesGroup(r, "on_the_way")) {
                c.on_the_way += 1;
            }
            if (matchesGroup(r, "received")) {
                c.received += 1;
            }
            if (matchesGroup(r, "cancelled")) {
                c.cancelled += 1;
            }
        }
        return c;
    }, [rows]);

    const activeCount = useMemo(
        () =>
            rows.filter((r) => r.status !== "delivered" && r.status !== "cancelled").length,
        [rows]
    );

    const totalSalesValue = useMemo(
        () => rows.reduce((s, r) => s + r.totalAmount, 0),
        [rows]
    );

    const unpaidOnline = useMemo(
        () =>
            rows.filter(
                (r) =>
                    r.status !== "cancelled" &&
                    r.paymentMethod === "online" &&
                    r.paymentStatus === "pending"
            ).length,
        [rows]
    );

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return rows.filter((r) => {
            if (!matchesGroup(r, group)) {
                return false;
            }
            if (!q) {
                return true;
            }
            return (
                r.id.toLowerCase().includes(q) ||
                r.buyerDisplayName.toLowerCase().includes(q) ||
                r.previewProductTitle.toLowerCase().includes(q)
            );
        });
    }, [rows, group, search]);

    useEffect(() => {
        setPage(1);
    }, [group, search]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const slice = useMemo(
        () => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
        [filtered, safePage]
    );

    useEffect(() => {
        if (page !== safePage) {
            setPage(safePage);
        }
    }, [page, safePage]);

    const showingFrom = filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
    const showingTo = Math.min(safePage * PAGE_SIZE, filtered.length);

    const filterNav: { id: GroupFilter; label: string }[] = [
        { id: "all", label: "All orders" },
        { id: "preparing", label: "Preparing" },
        { id: "packing", label: "Packing" },
        { id: "on_the_way", label: "On the way" },
        { id: "received", label: "Received" },
        { id: "cancelled", label: "Cancelled" }
    ];

    return (
        <div className="bg-[#050508]/50 p-4 md:p-6 lg:p-8">
            <div className="mx-auto max-w-7xl">
                <div className="flex flex-col gap-6 border-b border-white/10 pb-8 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-(--accent)">
                            Track your orders
                        </p>
                        <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground md:text-4xl">
                            Order management
                        </h1>
                        <p className="mt-3 max-w-xl text-sm leading-relaxed text-(--muted)">
                            Follow your stone orders from checkout to delivery. Update status on each
                            order&apos;s page and keep buyers informed in messages.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-4">
                        <div className="min-w-[140px] rounded-lg border border-white/10 bg-[#0e131c] px-5 py-4">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-(--muted)">
                                Active orders
                            </p>
                            <p className="mt-1 text-3xl font-bold tabular-nums text-(--accent)">
                                {activeCount}
                            </p>
                        </div>
                        <div className="min-w-[160px] rounded-lg border border-white/10 bg-[#0e131c] px-5 py-4">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-(--muted)">
                                Total order value
                            </p>
                            <p className="mt-1 text-xl font-bold tabular-nums text-foreground">
                                {formatPeso(totalSalesValue)}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="relative mt-6 max-w-xl">
                    <Search
                        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--muted)"
                        aria-hidden
                    />
                    <input
                        className="h-11 w-full border border-white/15 bg-[#080b10] pl-10 pr-3 text-sm text-foreground placeholder:text-(--muted) focus-visible:border-(--accent)/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20"
                        placeholder="Search orders, buyers, or products…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        aria-label="Search orders"
                    />
                </div>

                {unpaidOnline > 0 ? (
                    <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/95">
                        <span className="font-semibold">{unpaidOnline}</span> online{" "}
                        {unpaidOnline === 1 ? "order is" : "orders are"} still marked unpaid. Open the
                        order and mark paid after you verify payment.
                    </div>
                ) : null}

                <div className="mt-8 grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
                    <aside className="space-y-6 lg:sticky lg:top-4 lg:self-start">
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--muted)">
                                Status
                            </p>
                            <nav className="mt-3 flex flex-col gap-1" aria-label="Filter by status">
                                {filterNav.map((item) => {
                                    const on = group === item.id;
                                    const n = counts[item.id];
                                    return (
                                        <button
                                            key={item.id}
                                            type="button"
                                            onClick={() => setGroup(item.id)}
                                            className={`flex items-center justify-between rounded-md border px-3 py-2.5 text-left text-xs font-medium transition ${
                                                on
                                                    ? "border-white/20 bg-white/8 text-foreground shadow-[inset_3px_0_0_var(--accent)]"
                                                    : "border-white/10 bg-[#0e131c] text-(--muted) hover:border-white/20 hover:text-foreground"
                                            }`}
                                        >
                                            <span>{item.label}</span>
                                            <span
                                                className={`tabular-nums text-[10px] font-bold ${on ? "text-(--accent)" : ""}`}
                                            >
                                                {String(n).padStart(2, "0")}
                                            </span>
                                        </button>
                                    );
                                })}
                            </nav>
                        </div>

                        <div className="rounded-lg border border-white/10 bg-[#0e131c] p-4">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-(--accent)">
                                Heads-up
                            </p>
                            <p className="mt-2 text-xs leading-relaxed text-(--muted)">
                                Bad weather or holidays can slow couriers. If a shipment slips, message
                                your buyer from the order page so they know what to expect.
                            </p>
                            <Link
                                href="/seller/messages"
                                className="mt-3 inline-flex text-[10px] font-bold uppercase tracking-wide text-(--accent) hover:underline"
                            >
                                Open messages →
                            </Link>
                        </div>
                    </aside>

                    <div className="min-w-0">
                        <div className="hidden overflow-x-auto border border-white/10 lg:block">
                            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                                <thead>
                                    <tr className="border-b border-white/10 bg-[#0c1018]">
                                        <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-(--muted)">
                                            Order ID
                                        </th>
                                        <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-(--muted)">
                                            Customer / items
                                        </th>
                                        <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-(--muted)">
                                            Items
                                        </th>
                                        <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-(--muted)">
                                            Total price
                                        </th>
                                        <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-(--muted)">
                                            Status
                                        </th>
                                        <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-(--muted)">
                                            Action
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr>
                                            <td
                                                colSpan={6}
                                                className="px-4 py-16 text-center text-(--muted)"
                                            >
                                                Loading…
                                            </td>
                                        </tr>
                                    ) : slice.length === 0 ? (
                                        <tr>
                                            <td
                                                colSpan={6}
                                                className="px-4 py-16 text-center text-(--muted)"
                                            >
                                                No orders match this view.
                                            </td>
                                        </tr>
                                    ) : (
                                        slice.map((r) => (
                                            <tr
                                                key={r.id}
                                                className="border-b border-white/6 bg-[#080b10]/50 last:border-0"
                                            >
                                                <td className="px-4 py-4 font-mono text-xs text-foreground">
                                                    {r.id}
                                                </td>
                                                <td className="px-4 py-4">
                                                    <p className="font-semibold text-foreground">
                                                        {r.buyerDisplayName}
                                                    </p>
                                                    <p className="mt-0.5 text-xs text-(--muted)">
                                                        {r.previewProductTitle}
                                                    </p>
                                                    <p className="mt-1 text-[10px] text-(--muted)">
                                                        {formatTableDate(r.createdAt)}
                                                    </p>
                                                </td>
                                                <td className="px-4 py-4">
                                                    <span className="inline-flex min-w-10 items-center justify-center border border-(--accent)/40 px-2 py-1 text-xs font-bold tabular-nums text-(--accent)">
                                                        {r.itemCount}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-4 font-semibold tabular-nums text-foreground">
                                                    {formatPeso(r.totalAmount)}
                                                </td>
                                                <td className="px-4 py-4">
                                                    <span className="flex items-center gap-2">
                                                        <span
                                                            className={`h-2 w-2 shrink-0 rounded-full ${statusDotClass(r.status)}`}
                                                        />
                                                        <span className="text-[10px] font-bold uppercase tracking-wide text-foreground">
                                                            {statusLabel(r.status)}
                                                        </span>
                                                    </span>
                                                </td>
                                                <td className="px-4 py-4">
                                                    <Link
                                                        href={`/seller/orders/${encodeURIComponent(r.id)}`}
                                                        className="text-xs font-bold uppercase tracking-wide text-foreground hover:text-(--accent)"
                                                    >
                                                        View details
                                                    </Link>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <div className="space-y-3 lg:hidden">
                            {!loading &&
                                slice.map((r) => (
                                    <Link
                                        key={r.id}
                                        href={`/seller/orders/${encodeURIComponent(r.id)}`}
                                        className="block rounded-lg border border-white/10 bg-[#0e131c] p-4"
                                    >
                                        <p className="font-mono text-xs text-foreground">{r.id}</p>
                                        <p className="mt-1 font-semibold">{r.buyerDisplayName}</p>
                                        <p className="text-xs text-(--muted)">{r.previewProductTitle}</p>
                                        <p className="mt-2 text-sm font-bold text-(--accent)">
                                            {formatPeso(r.totalAmount)}
                                        </p>
                                        <p className="mt-2 text-[10px] font-bold uppercase text-foreground">
                                            {statusLabel(r.status)}
                                        </p>
                                    </Link>
                                ))}
                            {!loading && slice.length === 0 ? (
                                <p className="text-center text-sm text-(--muted)">No orders.</p>
                            ) : null}
                        </div>

                        {!loading && filtered.length > 0 ? (
                            <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                <p className="text-[11px] font-medium uppercase tracking-wide text-(--muted)">
                                    Showing {String(showingFrom).padStart(2, "0")} —{" "}
                                    {String(showingTo).padStart(2, "0")} of {filtered.length} results
                                </p>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        disabled={safePage <= 1}
                                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                                        className="flex h-9 w-9 items-center justify-center border border-white/15 text-(--muted) hover:text-foreground disabled:opacity-40"
                                        aria-label="Previous"
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                    </button>
                                    {pageWindow(safePage, totalPages).map((n) => (
                                        <button
                                            key={n}
                                            type="button"
                                            onClick={() => setPage(n)}
                                            className={`h-9 min-w-9 px-2 text-xs font-bold ${
                                                n === safePage
                                                    ? "bg-(--accent) text-[#030608]"
                                                    : "border border-white/10 text-(--muted)"
                                            }`}
                                        >
                                            {String(n).padStart(2, "0")}
                                        </button>
                                    ))}
                                    <button
                                        type="button"
                                        disabled={safePage >= totalPages}
                                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                        className="flex h-9 w-9 items-center justify-center border border-white/15 text-(--muted) hover:text-foreground disabled:opacity-40"
                                        aria-label="Next"
                                    >
                                        <ChevronRight className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                        ) : null}
                    </div>
                </div>

                <div className="mt-14 grid gap-4 sm:grid-cols-3">
                    <div className="relative overflow-hidden rounded-lg border border-white/10">
                        <div
                            className="absolute inset-0 bg-linear-to-br from-stone-600/50 to-[#0a0c10]"
                            aria-hidden
                        />
                        <div className="relative p-5">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-white/70">
                                Stone source
                            </p>
                            <p className="mt-2 text-sm font-semibold text-foreground">
                                Your workshop & materials
                            </p>
                        </div>
                    </div>
                    <div className="relative overflow-hidden rounded-lg border border-white/10">
                        <div
                            className="absolute inset-0 bg-linear-to-br from-slate-600/45 to-[#0a0c10]"
                            aria-hidden
                        />
                        <div className="relative p-5">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-white/70">
                                Shipping center
                            </p>
                            <p className="mt-2 text-sm font-semibold text-foreground">
                                Packing & handoff
                            </p>
                        </div>
                    </div>
                    <div className="relative overflow-hidden rounded-lg border border-white/10">
                        <div
                            className="absolute inset-0 bg-linear-to-br from-zinc-600/50 to-[#0a0c10]"
                            aria-hidden
                        />
                        <div className="relative p-5">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-white/70">
                                Final inspection
                            </p>
                            <p className="mt-2 text-sm font-semibold text-foreground">
                                Quality before dispatch
                            </p>
                        </div>
                    </div>
                </div>

                <footer className="mt-14 border-t border-white/10 pt-10">
                    <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-[0.2em]">{appName}</p>
                            <p className="mt-2 max-w-xs text-sm text-(--muted)">
                                Tools for Romblon stone sellers—listings, orders, and buyer chat.
                            </p>
                        </div>
                        <div>
                            <p className="text-[10px] font-semibold uppercase text-(--muted)">Support</p>
                            <ul className="mt-2 space-y-1 text-sm text-foreground/90">
                                <li>
                                    <Link href="/seller/messages" className="hover:text-(--accent)">
                                        Messages
                                    </Link>
                                </li>
                                <li>
                                    <a
                                        href="mailto:support@mizaweb.app"
                                        className="hover:text-(--accent)"
                                    >
                                        Contact
                                    </a>
                                </li>
                            </ul>
                        </div>
                        <div>
                            <p className="text-[10px] font-semibold uppercase text-(--muted)">Policies</p>
                            <ul className="mt-2 space-y-1 text-sm text-foreground/90">
                                <li>Product quality</li>
                                <li>Fair selling</li>
                            </ul>
                        </div>
                        <div>
                            <p className="text-[10px] uppercase tracking-wider text-(--muted)">
                                © {new Date().getFullYear()} {appName}
                            </p>
                        </div>
                    </div>
                </footer>
            </div>
        </div>
    );
}
