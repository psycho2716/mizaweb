"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
    Calendar,
    CalendarClock,
    Check,
    ChevronLeft,
    ChevronRight,
    CircleX,
    Download,
    MapPin,
    MessageCircle,
    Phone,
    Search,
    User
} from "lucide-react";
import { toast } from "sonner";
import {
    cancelOrderByBuyer,
    createBuyerAssetUploadUrl,
    getBuyerOrdersSummary,
    getOrderMessages,
    sendOrderMessage,
    submitBuyerOrderPaymentReceipt
} from "@/lib/api/endpoints";
import { canonicalPaymentReceiptUrlFromUploadTarget } from "@/lib/canonical-payment-receipt";
import { putToSignedUploadUrl } from "@/lib/storage/put-signed-upload";
import { formatCartSelectionsLine } from "@/lib/format-cart-selections";
import { cn, formatPeso, getAppName } from "@/lib/utils";
import type { BuyerOrderSummaryItem } from "@/types";
import type { Order, OrderMessage } from "@/types";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";
const PAGE_SIZE = 8;

type StatusFilter = "all" | "processing" | "in_transit" | "delivered" | "cancelled";

function dayBoundaryMs(isoDay: string, endOfDay: boolean): number {
    const d = new Date(isoDay);
    if (endOfDay) {
        d.setHours(23, 59, 59, 999);
    } else {
        d.setHours(0, 0, 0, 0);
    }
    return d.getTime();
}

function matchesOrderDateBounds(row: BuyerOrderSummaryItem, fromDay: string, toDay: string): boolean {
    if (!fromDay && !toDay) {
        return true;
    }
    const orderTime = new Date(row.createdAt).getTime();
    if (fromDay && orderTime < dayBoundaryMs(fromDay, false)) {
        return false;
    }
    if (toDay && orderTime > dayBoundaryMs(toDay, true)) {
        return false;
    }
    return true;
}

/** Buyer-initiated cancellation is allowed only before the order ships. */
function buyerCanCancelOrder(status: BuyerOrderSummaryItem["status"]): boolean {
    return status === "created" || status === "confirmed" || status === "processing";
}

function matchesStatusFilter(row: BuyerOrderSummaryItem, f: StatusFilter): boolean {
    if (f === "all") {
        return true;
    }
    if (f === "delivered") {
        return row.status === "delivered";
    }
    if (f === "cancelled") {
        return row.status === "cancelled";
    }
    if (f === "in_transit") {
        return row.status === "shipped";
    }
    return (
        row.status === "created" ||
        row.status === "confirmed" ||
        row.status === "processing"
    );
}

function statusBadge(row: BuyerOrderSummaryItem): { label: string; className: string } {
    switch (row.status) {
        case "delivered":
            return {
                label: "Delivered",
                className: "bg-white/10 text-(--muted)"
            };
        case "cancelled":
            return {
                label: "Cancelled",
                className: "bg-red-500/15 text-red-200"
            };
        case "shipped":
            return {
                label: "In transit",
                className: "bg-(--accent) text-[#030608]"
            };
        default:
            return {
                label: "Processing",
                className: "bg-amber-500/18 text-amber-100"
            };
    }
}

function mergeOrderSocket(
    rows: BuyerOrderSummaryItem[],
    order: Order
): BuyerOrderSummaryItem[] {
    const idx = rows.findIndex((r) => r.id === order.id);
    if (idx < 0) {
        return rows;
    }
    const r = rows[idx];
    return rows.map((x, i) => {
        if (i !== idx) {
            return x;
        }
        const next: BuyerOrderSummaryItem = {
            ...r,
            status: order.status,
            totalAmount: order.totalAmount,
            paymentMethod: order.paymentMethod,
            paymentStatus: order.paymentStatus,
            receiptStatus: order.receiptStatus,
            ...(order.estimatedDeliveryStartAt
                ? { estimatedDeliveryStartAt: order.estimatedDeliveryStartAt }
                : {}),
            ...(order.estimatedDeliveryEndAt
                ? { estimatedDeliveryEndAt: order.estimatedDeliveryEndAt }
                : {}),
            ...(order.estimatedDeliveryRangeDisplay
                ? { estimatedDeliveryRangeDisplay: order.estimatedDeliveryRangeDisplay }
                : {}),
            ...(order.shippingRecipientName
                ? { shippingRecipientName: order.shippingRecipientName }
                : {}),
            ...(order.shippingAddressLine ? { shippingAddressLine: order.shippingAddressLine } : {}),
            ...(order.shippingCity ? { shippingCity: order.shippingCity } : {}),
            ...(order.shippingPostalCode ? { shippingPostalCode: order.shippingPostalCode } : {}),
            ...(order.shippingContactNumber
                ? { shippingContactNumber: order.shippingContactNumber }
                : {}),
            ...(order.deliveryNotes ? { deliveryNotes: order.deliveryNotes } : {}),
            ...(order.cancellationReason ? { cancellationReason: order.cancellationReason } : {}),
            ...(order.qualityChecklist ? { qualityChecklist: order.qualityChecklist } : {})
        };
        if (order.receiptRequestNote !== undefined && order.receiptRequestNote !== "") {
            next.receiptRequestNote = order.receiptRequestNote;
        } else {
            delete next.receiptRequestNote;
        }
        return next;
    });
}

const DETAIL_DATE_OPTS: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric"
};

function summaryEstimatedDeliveryLabel(row: BuyerOrderSummaryItem | null): string | null {
    if (!row) {
        return null;
    }
    const display = row.estimatedDeliveryRangeDisplay?.trim();
    if (display) {
        return display;
    }
    const startAt = row.estimatedDeliveryStartAt;
    const endAt = row.estimatedDeliveryEndAt;
    if (startAt && endAt) {
        const a = new Date(startAt);
        const b = new Date(endAt);
        if (Number.isFinite(a.getTime()) && Number.isFinite(b.getTime())) {
            return `${a.toLocaleDateString(undefined, DETAIL_DATE_OPTS)} – ${b.toLocaleDateString(undefined, DETAIL_DATE_OPTS)}`;
        }
    }
    return null;
}

function formatOrderTableDate(iso: string): string {
    return new Date(iso).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric"
    });
}

function downloadOrdersCsv(rows: BuyerOrderSummaryItem[]) {
    const header = ["Order ID", "Order date", "Item preview", "Item count", "Total (PHP)", "Status"];
    const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const lines = [
        header.join(","),
        ...rows.map((r) =>
            [
                escape(r.id),
                escape(formatOrderTableDate(r.createdAt)),
                escape(r.previewProductTitle),
                String(r.itemCount),
                String(r.totalAmount),
                escape(statusBadge(r).label)
            ].join(",")
        )
    ];
    const bom = "\uFEFF";
    const blob = new Blob([bom + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `order-history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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

const fieldClass =
    "h-10 w-full rounded-md border border-white/15 bg-[#080b10] px-3 text-sm text-foreground placeholder:text-(--muted) focus-visible:border-(--accent)/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/25";

export function BuyerOrdersClient() {
    const appName = getAppName();
    const [rows, setRows] = useState<BuyerOrderSummaryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [activeOrderId, setActiveOrderId] = useState("");
    const [messages, setMessages] = useState<OrderMessage[]>([]);
    const [messageInput, setMessageInput] = useState("");
    const [cancelModalOpen, setCancelModalOpen] = useState(false);
    const [cancelReason, setCancelReason] = useState("");
    const [cancelSubmitting, setCancelSubmitting] = useState(false);
    const [receiptResubmitting, setReceiptResubmitting] = useState(false);
    const activeOrderIdRef = useRef(activeOrderId);
    activeOrderIdRef.current = activeOrderId;
    const detailRef = useRef<HTMLDivElement>(null);

    const loadRows = useCallback(async () => {
        setLoading(true);
        try {
            const res = await getBuyerOrdersSummary();
            setRows(res.data);
        } catch {
            setRows([]);
            toast.error("Could not load your orders.");
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
        const joinUserChannel = () => {
            if (user?.id) {
                socket.emit("join:channel", `user:${user.id}`);
            }
        };
        socket.on("connect", joinUserChannel);
        if (socket.connected) {
            joinUserChannel();
        }
        socket.on("order:updated", (order: Order) => {
            setRows((prev) => {
                if (!prev.some((r) => r.id === order.id)) {
                    void loadRows();
                    return prev;
                }
                return mergeOrderSocket(prev, order);
            });
        });
        socket.on("chat:message", (message: OrderMessage) => {
            if (message.orderId !== activeOrderIdRef.current) {
                return;
            }
            setMessages((previous) => {
                if (previous.some((entry) => entry.id === message.id)) {
                    return previous;
                }
                return [...previous, message].sort((a, b) =>
                    a.createdAt.localeCompare(b.createdAt)
                );
            });
        });
        if (!token) {
            socket.disconnect();
        }
        return () => {
            socket.off("connect", joinUserChannel);
            socket.disconnect();
        };
    }, [loadRows]);

    const handleResubmitReceipt = useCallback(
        async (file: File) => {
            if (!activeOrderId) {
                return;
            }
            setReceiptResubmitting(true);
            try {
                const target = await createBuyerAssetUploadUrl(file.name, "payment-receipt");
                const put = await putToSignedUploadUrl(target.uploadUrl, file);
                if (!put.ok) {
                    throw new Error("Upload failed");
                }
                const url = canonicalPaymentReceiptUrlFromUploadTarget(target);
                await submitBuyerOrderPaymentReceipt(activeOrderId, url);
                toast.success("New receipt sent to your seller.");
                await loadRows();
            } catch (e) {
                toast.error(e instanceof Error ? e.message : "Could not upload receipt.");
            } finally {
                setReceiptResubmitting(false);
            }
        },
        [activeOrderId, loadRows]
    );

    useEffect(() => {
        if (!activeOrderId) {
            setMessages([]);
            return;
        }
        getOrderMessages(activeOrderId)
            .then((response) =>
                setMessages(Array.isArray(response.data) ? response.data : [])
            )
            .catch(() => {
                setMessages([]);
                toast.error("Could not load messages for this order.");
            });
    }, [activeOrderId]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return rows.filter((r) => {
            if (!matchesStatusFilter(r, statusFilter)) {
                return false;
            }
            if (q && !r.id.toLowerCase().includes(q)) {
                return false;
            }
            if (!matchesOrderDateBounds(r, dateFrom, dateTo)) {
                return false;
            }
            return true;
        });
    }, [rows, statusFilter, search, dateFrom, dateTo]);

    useEffect(() => {
        setPage(1);
    }, [statusFilter, search, dateFrom, dateTo]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const pageRows = useMemo(
        () => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
        [filtered, safePage]
    );

    useEffect(() => {
        if (page !== safePage) {
            setPage(safePage);
        }
    }, [page, safePage]);

    async function handleSendMessage() {
        const body = messageInput.trim();
        if (!activeOrderId || !body) {
            return;
        }
        try {
            const res = await sendOrderMessage(activeOrderId, body);
            setMessageInput("");
            setMessages((prev) => {
                const message = res.data;
                if (prev.some((entry) => entry.id === message.id)) {
                    return prev;
                }
                return [...prev, message].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
            });
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not send message.");
        }
    }

    async function handleConfirmCancelOrder() {
        if (!activeOrderId || cancelReason.trim().length < 10) {
            return;
        }
        setCancelSubmitting(true);
        try {
            await cancelOrderByBuyer(activeOrderId, cancelReason.trim());
            setCancelModalOpen(false);
            setCancelReason("");
            const res = await getOrderMessages(activeOrderId);
            setMessages(res.data);
            await loadRows();
            toast.success("Order cancelled. Your reason was shared with the seller.");
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not cancel order.");
        } finally {
            setCancelSubmitting(false);
        }
    }

    function openDetails(orderId: string) {
        setActiveOrderId(orderId);
        requestAnimationFrame(() => {
            detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
    }

    const filterBtn = (key: StatusFilter, label: string) => (
        <button
            type="button"
            onClick={() => setStatusFilter(key)}
            className={cn(
                "min-h-9 rounded border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition",
                statusFilter === key
                    ? "border-white text-foreground"
                    : "border-transparent text-(--muted) hover:text-foreground/80"
            )}
        >
            {label}
        </button>
    );

    const showingFrom = filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
    const showingTo = Math.min(safePage * PAGE_SIZE, filtered.length);

    const activeOrderSummary = useMemo(
        () => (activeOrderId ? (rows.find((r) => r.id === activeOrderId) ?? null) : null),
        [rows, activeOrderId]
    );
    const activeEstimatedDelivery = summaryEstimatedDeliveryLabel(activeOrderSummary);
    const hasShippingSnapshot =
        Boolean(activeOrderSummary?.shippingAddressLine) ||
        Boolean(activeOrderSummary?.shippingCity) ||
        Boolean(activeOrderSummary?.shippingPostalCode);

    return (
        <main className="relative min-h-screen flex-1 overflow-hidden bg-[#050508] text-foreground">
            <div
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_36%_at_70%_-10%,rgba(34,199,243,0.08),transparent_55%)]"
                aria-hidden
            />

            <div className="relative z-10 mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-(--accent)">
                            Your order history
                        </p>
                        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
                            Order history
                        </h1>
                        <p className="mt-3 max-w-xl text-sm leading-relaxed text-(--muted)">
                            Review your orders and track each shipment. Open an order below to
                            message the seller about delivery or pickup.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            if (filtered.length === 0) {
                                toast.message("No orders to export for the current filters.");
                                return;
                            }
                            downloadOrdersCsv(filtered);
                            toast.success("Download started.");
                        }}
                        className="inline-flex h-11 shrink-0 items-center justify-center gap-2 bg-(--accent) px-6 text-xs font-bold uppercase tracking-[0.14em] text-[#030608] transition hover:brightness-110"
                    >
                        <Download className="h-4 w-4" aria-hidden />
                        Download history
                    </button>
                </div>

                <div className="mt-10 flex flex-col gap-4 border border-white/10 bg-[#080b10]/60 p-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between lg:gap-6">
                    <div className="flex flex-wrap gap-2">
                        {filterBtn("all", "All")}
                        {filterBtn("processing", "Processing")}
                        {filterBtn("in_transit", "In transit")}
                        {filterBtn("delivered", "Delivered")}
                        {filterBtn("cancelled", "Cancelled")}
                    </div>
                    <div className="flex w-full flex-col gap-3 sm:w-auto">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-(--muted)">
                            Order date range
                        </p>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-3">
                            <label className="text-[10px] font-semibold uppercase tracking-wide text-(--muted)">
                                <span className="mb-1 block">From</span>
                                <input
                                    type="date"
                                    className={cn(fieldClass, "w-full sm:w-[150px]")}
                                    value={dateFrom}
                                    onChange={(e) => setDateFrom(e.target.value)}
                                    aria-label="Order date from"
                                />
                            </label>
                            <span className="hidden pb-2 text-(--muted) sm:inline">—</span>
                            <label className="text-[10px] font-semibold uppercase tracking-wide text-(--muted)">
                                <span className="mb-1 block">To</span>
                                <input
                                    type="date"
                                    className={cn(fieldClass, "w-full sm:w-[150px]")}
                                    value={dateTo}
                                    onChange={(e) => setDateTo(e.target.value)}
                                    aria-label="Order date to"
                                />
                            </label>
                        </div>
                    </div>
                    <div className="relative w-full sm:max-w-xs">
                        <Search
                            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--muted)"
                            aria-hidden
                        />
                        <input
                            className={cn(fieldClass, "pl-10")}
                            placeholder="Search order ID…"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            aria-label="Search order ID"
                        />
                    </div>
                </div>

                <div className="mt-6 overflow-x-auto border border-white/10">
                    <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                        <thead>
                            <tr className="border-b border-white/10 bg-[#0c1018]">
                                <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-(--muted)">
                                    Order ID
                                </th>
                                <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-(--muted)">
                                    Order date
                                </th>
                                <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-(--muted)">
                                    Items purchased
                                </th>
                                <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-(--muted)">
                                    Total price
                                </th>
                                <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-(--muted)">
                                    Status
                                </th>
                                <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-(--muted)">
                                    Action
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={6} className="px-4 py-16 text-center text-(--muted)">
                                        Loading orders…
                                    </td>
                                </tr>
                            ) : pageRows.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-4 py-16 text-center text-(--muted)">
                                        {rows.length === 0
                                            ? "You have no orders yet. Browse products and check out from your cart."
                                            : "No orders match these filters."}
                                    </td>
                                </tr>
                            ) : (
                                pageRows.map((r) => {
                                    const badge = statusBadge(r);
                                    return (
                                        <tr
                                            key={r.id}
                                            className="border-b border-white/6 bg-[#080b10]/40 last:border-0"
                                        >
                                            <td className="px-4 py-4 font-mono text-xs text-foreground/95">
                                                {r.id}
                                            </td>
                                            <td className="px-4 py-4 text-(--muted)">
                                                {formatOrderTableDate(r.createdAt)}
                                            </td>
                                            <td className="px-4 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="h-11 w-11 shrink-0 overflow-hidden bg-[#12161f]">
                                                        {r.previewThumbnailUrl ? (
                                                            // eslint-disable-next-line @next/next/no-img-element
                                                            <img
                                                                src={r.previewThumbnailUrl}
                                                                alt=""
                                                                className="h-full w-full object-cover"
                                                            />
                                                        ) : (
                                                            <div className="flex h-full items-center justify-center text-[10px] text-(--muted)">
                                                                —
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="font-medium text-foreground">
                                                            {r.previewProductTitle}
                                                        </p>
                                                        {r.itemCount > 1 ? (
                                                            <p className="text-xs text-(--muted)">
                                                                {r.itemCount} items in this order
                                                            </p>
                                                        ) : null}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-4 font-semibold tabular-nums text-foreground">
                                                {formatPeso(r.totalAmount)}
                                            </td>
                                            <td className="px-4 py-4">
                                                <span
                                                    className={cn(
                                                        "inline-block px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide",
                                                        badge.className
                                                    )}
                                                >
                                                    {badge.label}
                                                </span>
                                            </td>
                                            <td className="px-4 py-4">
                                                <button
                                                    type="button"
                                                    onClick={() => openDetails(r.id)}
                                                    className="text-xs font-bold uppercase tracking-wide text-foreground underline-offset-4 hover:text-(--accent) hover:underline"
                                                >
                                                    View details
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {!loading && filtered.length > 0 ? (
                    <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs text-(--muted)">
                            Showing {showingFrom}–{showingTo} of {filtered.length}{" "}
                            {filtered.length === 1 ? "order" : "orders"}
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                disabled={safePage <= 1}
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                className="flex h-9 w-9 items-center justify-center border border-white/15 text-(--muted) transition hover:border-white/30 hover:text-foreground disabled:opacity-40"
                                aria-label="Previous page"
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </button>
                            {pageWindow(safePage, totalPages).map((n) => (
                                <button
                                    key={n}
                                    type="button"
                                    onClick={() => setPage(n)}
                                    className={cn(
                                        "h-9 min-w-9 px-2 text-xs font-bold transition",
                                        n === safePage
                                            ? "bg-(--accent) text-[#030608]"
                                            : "border border-white/10 text-(--muted) hover:border-white/25 hover:text-foreground"
                                    )}
                                >
                                    {n}
                                </button>
                            ))}
                            <button
                                type="button"
                                disabled={safePage >= totalPages}
                                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                className="flex h-9 w-9 items-center justify-center border border-white/15 text-(--muted) transition hover:border-white/30 hover:text-foreground disabled:opacity-40"
                                aria-label="Next page"
                            >
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                ) : null}

                <div
                    id="order-conversation"
                    ref={detailRef}
                    className="mt-12 scroll-mt-28 border border-white/10 bg-[#0e131c] p-5 sm:p-6"
                >
                    {activeOrderId ? (
                        <>
                            <h2 className="text-lg font-bold tracking-tight">
                                Order details ·{" "}
                                <span className="font-mono text-base font-normal text-(--muted)">
                                    {activeOrderId}
                                </span>
                            </h2>
                            <p className="mt-1 text-xs text-(--muted)">
                                Summary for this purchase, then your conversation with the seller.
                            </p>

                            {activeOrderSummary ? (
                                <div className="mt-6 space-y-5 border-b border-white/10 pb-6">
                                    {activeOrderSummary.status === "cancelled" ? (
                                        <div
                                            className="rounded-lg border border-red-500/35 bg-red-500/10 p-4"
                                            role="alert"
                                        >
                                            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-200">
                                                Order cancelled
                                            </p>
                                            {activeOrderSummary.cancellationReason ? (
                                                <p className="mt-2 text-sm leading-relaxed text-foreground">
                                                    {activeOrderSummary.cancellationReason}
                                                </p>
                                            ) : (
                                                <p className="mt-2 text-sm text-(--muted)">
                                                    No cancellation details were stored.
                                                </p>
                                            )}
                                        </div>
                                    ) : null}
                                    {activeOrderSummary.lineItems.length > 0 ? (
                                        <div className="space-y-3">
                                            <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-(--muted)">
                                                Items and customizations
                                            </p>
                                            <ul className="space-y-3">
                                                {activeOrderSummary.lineItems.map((line) => {
                                                    const customLine = formatCartSelectionsLine(
                                                        undefined,
                                                        line.selections
                                                    );
                                                    return (
                                                        <li
                                                            key={line.id}
                                                            className="flex gap-3 rounded-md border border-white/10 bg-[#080b10] p-3"
                                                        >
                                                            <div className="h-14 w-14 shrink-0 overflow-hidden bg-[#12161f]">
                                                                {line.thumbnailUrl ? (
                                                                    // eslint-disable-next-line @next/next/no-img-element
                                                                    <img
                                                                        src={line.thumbnailUrl}
                                                                        alt=""
                                                                        className="h-full w-full object-cover"
                                                                    />
                                                                ) : (
                                                                    <div className="flex h-full items-center justify-center text-[10px] text-(--muted)">
                                                                        —
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div className="min-w-0 flex-1">
                                                                <p className="text-sm font-semibold text-foreground">
                                                                    {line.productTitle}
                                                                </p>
                                                                <p className="mt-0.5 text-xs text-(--muted)">
                                                                    Quantity: {line.quantity}
                                                                </p>
                                                                {customLine ? (
                                                                    <p className="mt-2 text-xs leading-relaxed text-foreground/90">
                                                                        <span className="font-medium text-(--muted)">
                                                                            Your choices:{" "}
                                                                        </span>
                                                                        {customLine}
                                                                    </p>
                                                                ) : null}
                                                            </div>
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        </div>
                                    ) : null}
                                    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                                    <div className="space-y-1">
                                        <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-(--muted)">
                                            <Calendar className="h-3.5 w-3.5 text-(--accent)" aria-hidden />
                                            Order date
                                        </p>
                                        <p className="text-sm font-medium text-foreground">
                                            {formatOrderTableDate(activeOrderSummary.createdAt)}
                                        </p>
                                        <p className="text-[11px] text-(--muted)">
                                            When this order was placed.
                                        </p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-(--muted)">
                                            <CalendarClock
                                                className="h-3.5 w-3.5 text-(--accent)"
                                                aria-hidden
                                            />
                                            Estimated delivery
                                        </p>
                                        {activeEstimatedDelivery ? (
                                            <p className="text-sm font-medium leading-snug text-foreground">
                                                {activeEstimatedDelivery}
                                            </p>
                                        ) : (
                                            <p className="text-sm text-(--muted)">
                                                Not stored for this order.
                                            </p>
                                        )}
                                        <p className="text-[11px] text-(--muted)">
                                            Estimate only — your seller may confirm timing.
                                        </p>
                                    </div>
                                    <div className="space-y-1 sm:col-span-2 lg:col-span-1">
                                        <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-(--muted)">
                                            <Phone className="h-3.5 w-3.5 text-(--accent)" aria-hidden />
                                            Contact number
                                        </p>
                                        {activeOrderSummary.shippingContactNumber ? (
                                            <p className="text-sm font-medium tabular-nums text-foreground">
                                                {activeOrderSummary.shippingContactNumber}
                                            </p>
                                        ) : (
                                            <p className="text-sm text-(--muted)">
                                                Not stored for this order.
                                            </p>
                                        )}
                                    </div>
                                    <div className="space-y-2 sm:col-span-2 lg:col-span-3">
                                        <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-(--muted)">
                                            <MapPin className="h-3.5 w-3.5 text-(--accent)" aria-hidden />
                                            Shipping address
                                        </p>
                                        {activeOrderSummary.shippingRecipientName ? (
                                            <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                                                <User className="h-4 w-4 shrink-0 text-(--muted)" aria-hidden />
                                                {activeOrderSummary.shippingRecipientName}
                                            </p>
                                        ) : null}
                                        {hasShippingSnapshot ? (
                                            <p className="text-sm leading-relaxed text-foreground">
                                                {[
                                                    activeOrderSummary.shippingAddressLine,
                                                    activeOrderSummary.shippingCity,
                                                    activeOrderSummary.shippingPostalCode
                                                ]
                                                    .filter(Boolean)
                                                    .join(", ")}
                                            </p>
                                        ) : (
                                            <p className="text-sm text-(--muted)">
                                                Not stored for this order.
                                            </p>
                                        )}
                                    </div>
                                    {activeOrderSummary.deliveryNotes ? (
                                        <div className="space-y-1 sm:col-span-2 lg:col-span-3">
                                            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--muted)">
                                                Delivery notes
                                            </p>
                                            <p className="rounded-md border border-white/10 bg-[#080b10] p-3 text-sm leading-relaxed text-foreground/95">
                                                {activeOrderSummary.deliveryNotes}
                                            </p>
                                        </div>
                                    ) : null}
                                    </div>
                                </div>
                            ) : null}

                            {activeOrderSummary &&
                            activeOrderSummary.status !== "created" &&
                            activeOrderSummary.status !== "cancelled" &&
                            activeOrderSummary.qualityChecklist?.items?.length ? (
                                <div className="mt-6 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.07] p-4">
                                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-200/90">
                                        Seller quality checklist
                                    </p>
                                    <p className="mt-1 text-xs text-(--muted)">
                                        Your seller confirmed these when they accepted your order:
                                    </p>
                                    <ul className="mt-3 space-y-2.5 text-sm text-foreground/95">
                                        {activeOrderSummary.qualityChecklist.items.map((row) => (
                                            <li key={row.id} className="flex gap-2.5">
                                                <Check
                                                    className={cn(
                                                        "mt-0.5 h-4 w-4 shrink-0",
                                                        row.checked
                                                            ? "text-emerald-400"
                                                            : "text-white/20"
                                                    )}
                                                    aria-hidden
                                                />
                                                <span
                                                    className={row.checked ? "" : "text-(--muted)"}
                                                >
                                                    {row.label}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ) : activeOrderSummary &&
                              activeOrderSummary.status !== "created" &&
                              activeOrderSummary.status !== "cancelled" &&
                              !activeOrderSummary.qualityChecklist ? (
                                <p className="mt-6 text-xs text-(--muted)">
                                    No seller quality checklist is on file for this order (it may
                                    have been placed before this feature).
                                </p>
                            ) : null}

                            {activeOrderSummary &&
                            activeOrderSummary.paymentMethod === "online" &&
                            activeOrderSummary.receiptStatus === "resubmit_requested" &&
                            activeOrderSummary.status !== "cancelled" ? (
                                <div className="mt-6 rounded-lg border border-amber-500/35 bg-amber-950/25 p-4">
                                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-200/90">
                                        New receipt requested
                                    </p>
                                    <p className="mt-2 text-sm text-foreground">
                                        Your seller asked you to upload a clearer or updated
                                        payment proof.
                                    </p>
                                    {activeOrderSummary.receiptRequestNote ? (
                                        <p className="mt-3 rounded-md border border-white/10 bg-[#080b10] p-3 text-sm leading-relaxed text-foreground/95">
                                            <span className="font-semibold text-(--muted)">
                                                From seller:{" "}
                                            </span>
                                            {activeOrderSummary.receiptRequestNote}
                                        </p>
                                    ) : null}
                                    <label className="mt-4 block">
                                        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-(--muted)">
                                            Upload new receipt (image)
                                        </span>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            disabled={receiptResubmitting}
                                            className="block w-full text-xs text-(--muted) file:mr-3 file:rounded-md file:border-0 file:bg-(--accent)/20 file:px-3 file:py-2 file:text-xs file:font-bold file:text-(--accent) hover:file:brightness-110 disabled:opacity-50"
                                            onChange={(e) => {
                                                const f = e.target.files?.[0];
                                                e.target.value = "";
                                                if (f) {
                                                    void handleResubmitReceipt(f);
                                                }
                                            }}
                                        />
                                    </label>
                                    {receiptResubmitting ? (
                                        <p className="mt-2 text-xs text-(--muted)">Uploading…</p>
                                    ) : null}
                                </div>
                            ) : null}

                            {activeOrderSummary &&
                            buyerCanCancelOrder(activeOrderSummary.status) ? (
                                <div className="mt-6 border-t border-white/10 pt-6">
                                    <button
                                        type="button"
                                        onClick={() => setCancelModalOpen(true)}
                                        className="inline-flex h-10 items-center gap-2 border border-red-500/45 px-4 text-xs font-bold uppercase tracking-wide text-red-200 hover:bg-red-500/10"
                                    >
                                        <CircleX className="h-4 w-4 shrink-0" aria-hidden />
                                        Cancel this order
                                    </button>
                                    <p className="mt-2 text-[11px] text-(--muted)">
                                        You can cancel before the seller ships. You must give a
                                        reason (at least 10 characters). The seller will see it in
                                        this thread.
                                    </p>
                                </div>
                            ) : null}

                            <h3 className="mt-6 flex items-center gap-2 text-sm font-bold tracking-tight text-foreground">
                                <MessageCircle className="h-4 w-4 text-(--accent)" aria-hidden />
                                Messages
                            </h3>
                            <p className="mt-1 text-xs text-(--muted)">
                                Chat with the seller about delivery, pickup, or questions on this
                                order.
                            </p>
                            <div className="mt-4 max-h-72 space-y-2 overflow-auto rounded-lg border border-white/10 bg-[#080b10] p-3 text-sm">
                                {messages.map((message) => (
                                    <div
                                        key={message.id}
                                        className="rounded-md border border-white/10 bg-black/25 p-3"
                                    >
                                        <p className="text-xs font-semibold text-(--accent)">
                                            {message.senderId}
                                        </p>
                                        <p className="mt-1 text-foreground">{message.body}</p>
                                        <p className="mt-1 text-[10px] text-(--muted)">
                                            {new Date(message.createdAt).toLocaleString()}
                                        </p>
                                    </div>
                                ))}
                                {messages.length === 0 ? (
                                    <p className="text-(--muted)">No messages yet.</p>
                                ) : null}
                            </div>
                            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                                <input
                                    className={cn(fieldClass, "flex-1")}
                                    value={messageInput}
                                    onChange={(e) => setMessageInput(e.target.value)}
                                    placeholder="Write a message to the seller…"
                                    disabled={activeOrderSummary?.status === "cancelled"}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" && !e.shiftKey) {
                                            e.preventDefault();
                                            void handleSendMessage();
                                        }
                                    }}
                                />
                                <button
                                    type="button"
                                    onClick={() => void handleSendMessage()}
                                    disabled={activeOrderSummary?.status === "cancelled"}
                                    className="h-10 shrink-0 bg-(--accent) px-6 text-xs font-bold uppercase tracking-wide text-[#030608] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    Send
                                </button>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    setActiveOrderId("");
                                    setCancelModalOpen(false);
                                    setCancelReason("");
                                }}
                                className="mt-4 text-xs font-semibold uppercase tracking-wide text-(--muted) hover:text-foreground"
                            >
                                Close panel
                            </button>
                        </>
                    ) : (
                        <p className="text-sm text-(--muted)">
                            Select <span className="font-semibold text-foreground">View details</span>{" "}
                            on an order to open messaging.
                        </p>
                    )}

                    {cancelModalOpen && activeOrderId ? (
                        <div
                            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="buyer-cancel-order-title"
                        >
                            <div className="w-full max-w-md border border-white/15 bg-[#0e131c] p-6 shadow-[0_0_48px_rgba(0,0,0,0.5)]">
                                <h2
                                    id="buyer-cancel-order-title"
                                    className="text-lg font-bold tracking-tight text-foreground"
                                >
                                    Cancel this order?
                                </h2>
                                <p className="mt-2 text-sm text-(--muted)">
                                    Your seller will see this reason in the messages below. Minimum
                                    10 characters.
                                </p>
                                <textarea
                                    className={cn(fieldClass, "mt-4 min-h-[120px] resize-y py-2")}
                                    value={cancelReason}
                                    onChange={(e) => setCancelReason(e.target.value)}
                                    placeholder="Explain why you are cancelling (e.g. ordered by mistake, found another item)…"
                                    disabled={cancelSubmitting}
                                    aria-label="Reason for cancelling the order"
                                />
                                <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                                    <button
                                        type="button"
                                        disabled={cancelSubmitting}
                                        onClick={() => {
                                            setCancelModalOpen(false);
                                            setCancelReason("");
                                        }}
                                        className="h-10 border border-white/15 px-4 text-xs font-bold uppercase tracking-wide hover:bg-white/5 disabled:opacity-50"
                                    >
                                        Keep order
                                    </button>
                                    <button
                                        type="button"
                                        disabled={
                                            cancelSubmitting || cancelReason.trim().length < 10
                                        }
                                        onClick={() => void handleConfirmCancelOrder()}
                                        className="h-10 bg-red-600/90 px-4 text-xs font-bold uppercase tracking-wide text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                        {cancelSubmitting ? "Cancelling…" : "Confirm cancellation"}
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : null}
                </div>
            </div>

            <footer className="relative z-10 border-t border-white/[0.07] bg-[#030406]">
                <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
                    <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-[0.2em] text-foreground">
                                {appName}
                            </p>
                            <p className="mt-3 max-w-xs text-sm leading-relaxed text-(--muted)">
                                Stone décor and gifts from verified sellers—browse, message, and buy
                                in one place.
                            </p>
                        </div>
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--muted)">
                                Browse
                            </p>
                            <ul className="mt-3 space-y-2 text-sm">
                                <li>
                                    <Link
                                        href="/products"
                                        className="text-foreground/90 hover:text-(--accent)"
                                    >
                                        Shop products
                                    </Link>
                                </li>
                                <li>
                                    <Link
                                        href="/buyer/reviews"
                                        className="text-foreground/90 hover:text-(--accent)"
                                    >
                                        My reviews
                                    </Link>
                                </li>
                            </ul>
                        </div>
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--muted)">
                                Help
                            </p>
                            <ul className="mt-3 space-y-2 text-sm">
                                <li>
                                    <a
                                        href="mailto:support@mizaweb.app"
                                        className="text-foreground/90 hover:text-(--accent)"
                                    >
                                        Contact us
                                    </a>
                                </li>
                                <li>
                                    <Link
                                        href="/buyer/messages"
                                        className="text-foreground/90 hover:text-(--accent)"
                                    >
                                        Messages
                                    </Link>
                                </li>
                            </ul>
                        </div>
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--muted)">
                                Policies
                            </p>
                            <ul className="mt-3 space-y-2 text-sm text-foreground/90">
                                <li>Product quality</li>
                                <li>Fair buying</li>
                            </ul>
                            <p className="mt-6 text-[10px] uppercase tracking-[0.12em] text-(--muted)">
                                © {new Date().getFullYear()} {appName}. All rights reserved.
                            </p>
                        </div>
                    </div>
                </div>
            </footer>
        </main>
    );
}
