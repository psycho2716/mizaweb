"use client";

import { ChevronRight, MessageSquare, Printer } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { io, type Socket } from "socket.io-client";
import { AdminTablePagination } from "@/components/admin/admin-table-pagination";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    getOrderMessages,
    getOrders,
    requestReceiptResubmission,
    sendOrderMessage,
    updateOrderPaymentStatus,
    updateOrderStatus
} from "@/lib/api/endpoints";
import { formatSellerEnumLabel, SELLER_ORDER_STATUS_LABEL } from "@/lib/seller-display";
import { cn, formatPeso } from "@/lib/utils";
import type { Order, OrderMessage } from "@/types";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

const PAGE_SIZE = 8;

const inputDark =
    "h-9 w-full rounded-md border border-(--border) bg-[#080b10] px-3 text-xs text-foreground placeholder:text-(--muted)";
const btnPrimary =
    "bg-(--accent) font-semibold uppercase tracking-wide text-[#050608] hover:bg-(--accent)/90 shadow-[0_0_20px_rgba(34,199,243,0.2)]";
const btnOutline =
    "border-(--border) bg-transparent text-foreground hover:bg-(--surface-elevated)";

type StatusFilter = "all" | Order["status"];

const PIPELINE_STEPS: { status: Order["status"]; num: string; short: string; hint: string }[] = [
    { status: "created", num: "01", short: "New", hint: "Waiting for you to confirm" },
    { status: "confirmed", num: "02", short: "Confirmed", hint: "You accepted the order" },
    { status: "processing", num: "03", short: "Preparing", hint: "Packaging or getting it ready" },
    { status: "shipped", num: "04", short: "Shipped", hint: "On the way to the buyer" },
    { status: "delivered", num: "05", short: "Delivered", hint: "Buyer has received it" }
];

function pipelineIndex(status: Order["status"]): number {
    return PIPELINE_STEPS.findIndex((s) => s.status === status);
}

function buyerLabel(buyerId: string): string {
    const tail = buyerId.length > 6 ? buyerId.slice(-6) : buyerId;
    return `Buyer · …${tail}`;
}

function canGoTo(order: Order, target: "confirmed" | "processing" | "shipped" | "delivered"): boolean {
    switch (target) {
        case "confirmed":
            return order.status === "created";
        case "processing":
            return order.status === "confirmed";
        case "shipped":
            return order.status === "confirmed" || order.status === "processing";
        case "delivered":
            return order.status === "shipped";
        default:
            return false;
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
            return "bg-foreground";
        case "delivered":
            return "bg-emerald-500/80";
        default:
            return "bg-(--muted)";
    }
}

function openPrintableOrderSummary(order: Order): void {
    const lines = [
        "Order summary",
        `Order ID: ${order.id}`,
        `Buyer: ${order.buyerId}`,
        `Status: ${SELLER_ORDER_STATUS_LABEL[order.status]}`,
        `Payment: ${order.paymentMethod} — ${order.paymentStatus}`,
        `Total: ${formatPeso(order.totalAmount)}`,
        `Placed: ${new Date(order.createdAt).toLocaleString()}`
    ];
    const w = window.open("", "_blank", "width=640,height=720");
    if (!w) return;
    w.document.write(
        `<!DOCTYPE html><html><head><title>Order ${order.id}</title>
        <style>body{font-family:system-ui,sans-serif;padding:24px;background:#111;color:#eee;line-height:1.5}</style></head><body><pre>${lines.join("\n")}</pre></body></html>`
    );
    w.document.close();
    w.focus();
    w.print();
    w.close();
}

function OrderPipelineStepper({ order }: { order: Order }) {
    const idx = pipelineIndex(order.status);
    return (
        <div className="overflow-x-auto pb-1">
            <ol className="flex min-w-[520px] items-start gap-0">
                {PIPELINE_STEPS.map((step, i) => {
                    const done = i < idx;
                    const current = i === idx;
                    const upcoming = i > idx;
                    return (
                        <li key={step.status} className="flex flex-1 items-start">
                            <div className="flex w-full flex-col items-center text-center">
                                <div
                                    className={cn(
                                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold tabular-nums",
                                        done && "border-emerald-500/50 bg-emerald-500/15 text-emerald-200",
                                        current &&
                                            "border-(--accent) bg-(--accent)/15 text-(--accent) shadow-[0_0_16px_rgba(34,199,243,0.25)]",
                                        upcoming && "border-(--border) bg-[#080b10] text-(--muted)"
                                    )}
                                >
                                    {step.num}
                                </div>
                                <p
                                    className={cn(
                                        "mt-2 text-[10px] font-semibold uppercase tracking-wider",
                                        current ? "text-(--accent)" : "text-(--muted)"
                                    )}
                                >
                                    {step.short}
                                </p>
                                <p className="mt-0.5 hidden px-1 text-[9px] leading-tight text-(--muted) sm:block">
                                    {step.hint}
                                </p>
                            </div>
                            {i < PIPELINE_STEPS.length - 1 ? (
                                <div className="mx-0.5 mt-4 hidden h-px min-w-[12px] flex-1 sm:block">
                                    <div
                                        className={cn(
                                            "h-px w-full",
                                            i < idx ? "bg-emerald-500/40" : "bg-(--border)"
                                        )}
                                    />
                                </div>
                            ) : null}
                        </li>
                    );
                })}
            </ol>
        </div>
    );
}

export default function SellerOrdersPage() {
    const searchParams = useSearchParams();
    const [orders, setOrders] = useState<Order[]>([]);
    const [selectedOrderId, setSelectedOrderId] = useState("");
    const [messages, setMessages] = useState<OrderMessage[]>([]);
    const [messageInput, setMessageInput] = useState("");
    const selectedOrderIdRef = useRef(selectedOrderId);
    selectedOrderIdRef.current = selectedOrderId;
    const [receiptNoteByOrder, setReceiptNoteByOrder] = useState<Record<string, string>>({});
    const [page, setPage] = useState(1);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [sellerUserId, setSellerUserId] = useState("");

    const sortedOrders = useMemo(
        () => [...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        [orders]
    );

    const filteredOrders = useMemo(() => {
        if (statusFilter === "all") return sortedOrders;
        return sortedOrders.filter((o) => o.status === statusFilter);
    }, [sortedOrders, statusFilter]);

    const totalPages = Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const pageSlice = useMemo(() => {
        const start = (safePage - 1) * PAGE_SIZE;
        return filteredOrders.slice(start, start + PAGE_SIZE);
    }, [filteredOrders, safePage]);

    useEffect(() => {
        setPage(1);
    }, [statusFilter]);

    const activeOrdersCount = useMemo(
        () => orders.filter((o) => o.status !== "delivered").length,
        [orders]
    );

    const unpaidOnlineCount = useMemo(
        () => orders.filter((o) => o.paymentMethod === "online" && o.paymentStatus === "pending").length,
        [orders]
    );

    const filterCounts = useMemo(() => {
        const c: Record<StatusFilter, number> = {
            all: sortedOrders.length,
            created: 0,
            confirmed: 0,
            processing: 0,
            shipped: 0,
            delivered: 0
        };
        for (const o of sortedOrders) {
            c[o.status] += 1;
        }
        return c;
    }, [sortedOrders]);

    const selectedOrder = useMemo(
        () => (selectedOrderId ? orders.find((o) => o.id === selectedOrderId) : undefined),
        [orders, selectedOrderId]
    );

    async function handleStatusUpdate(
        orderId: string,
        status: "confirmed" | "processing" | "shipped" | "delivered"
    ) {
        await updateOrderStatus(orderId, status);
        const response = await getOrders();
        setOrders(response.data);
    }

    async function handlePaymentStatus(orderId: string, paymentStatus: "pending" | "paid") {
        await updateOrderPaymentStatus(orderId, paymentStatus);
        const response = await getOrders();
        setOrders(response.data);
    }

    async function handleReceiptRequest(orderId: string) {
        const note = receiptNoteByOrder[orderId]?.trim();
        if (!note) return;
        await requestReceiptResubmission(orderId, note);
        const response = await getOrders();
        setOrders(response.data);
    }

    async function handleSendMessage() {
        if (!selectedOrderId || !messageInput.trim()) return;
        await sendOrderMessage(selectedOrderId, messageInput.trim());
        setMessageInput("");
    }

    useEffect(() => {
        try {
            const raw = localStorage.getItem("miza_user");
            const u = raw ? (JSON.parse(raw) as { id?: string }) : null;
            if (u?.id) setSellerUserId(u.id);
        } catch {
            setSellerUserId("");
        }
        getOrders()
            .then((response) => {
                setOrders(response.data);
            })
            .catch(() => {
                setOrders([]);
            });
        const rawUser = localStorage.getItem("miza_user");
        const user = rawUser ? (JSON.parse(rawUser) as { id: string }) : null;
        const socket: Socket = io(BACKEND_URL, { transports: ["websocket"] });
        if (user?.id) {
            socket.emit("join:channel", `user:${user.id}`);
        }
        socket.on("order:updated", (order: Order) => {
            setOrders((previous) => {
                const existing = previous.find((entry) => entry.id === order.id);
                if (existing) {
                    return previous.map((entry) => (entry.id === order.id ? order : entry));
                }
                return [order, ...previous];
            });
        });
        socket.on("chat:message", (message: OrderMessage) => {
            if (message.orderId !== selectedOrderIdRef.current) {
                return;
            }
            setMessages((previous) => {
                if (previous.some((entry) => entry.id === message.id)) {
                    return previous;
                }
                return [...previous, message].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
            });
        });
        return () => {
            socket.disconnect();
        };
    }, []);

    useEffect(() => {
        const oid = searchParams.get("order");
        if (!oid || orders.length === 0) {
            return;
        }
        if (orders.some((o) => o.id === oid)) {
            setSelectedOrderId(oid);
        }
    }, [searchParams, orders]);

    useEffect(() => {
        if (!selectedOrderId) {
            return;
        }
        getOrderMessages(selectedOrderId)
            .then((response) => setMessages(response.data))
            .catch(() => setMessages([]));
    }, [selectedOrderId]);

    const filterItems: { id: StatusFilter; label: string }[] = [
        { id: "all", label: "All orders" },
        { id: "created", label: "New — needs confirmation" },
        { id: "confirmed", label: "Confirmed" },
        { id: "processing", label: "Preparing" },
        { id: "shipped", label: "Shipped" },
        { id: "delivered", label: "Delivered" }
    ];

    return (
        <div className="p-4 md:p-6 md:py-4 lg:p-8 lg:py-5">
            <div className="flex flex-col gap-4 border-b border-(--border) pb-6 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--accent)">
                        Fulfillment
                    </p>
                    <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                        Order management
                    </h1>
                    <p className="mt-2 max-w-xl text-sm text-(--muted)">
                        Track and update each order from confirmation through delivery. Message the buyer from
                        the panel below when an order is selected.
                    </p>
                </div>
                <div className="flex flex-wrap gap-3">
                    <div className="rounded-lg border border-(--border) bg-[#0b0e14] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-(--muted)">
                            Active orders
                        </p>
                        <p className="mt-1 text-2xl font-semibold tabular-nums text-(--accent)">
                            {activeOrdersCount}
                        </p>
                        <p className="mt-0.5 text-[10px] text-(--muted)">Not delivered yet</p>
                    </div>
                    <div className="rounded-lg border border-(--border) bg-[#0b0e14] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-(--muted)">
                            Online — awaiting payment
                        </p>
                        <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                            {unpaidOnlineCount}
                        </p>
                        <p className="mt-0.5 text-[10px] text-(--muted)">Confirm when paid</p>
                    </div>
                    <div className="rounded-lg border border-(--border) bg-[#0b0e14] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-(--muted)">
                            All orders
                        </p>
                        <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                            {sortedOrders.length}
                        </p>
                    </div>
                </div>
            </div>

            {unpaidOnlineCount > 0 ? (
                <div className="mt-4 rounded-lg border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-sm text-amber-100/90">
                    <span className="font-semibold text-amber-200">{unpaidOnlineCount}</span> online checkout
                    {unpaidOnlineCount === 1 ? " is" : "s are"} still marked unpaid. Open each order and tap{" "}
                    <span className="font-semibold">Mark paid</span> once you verify the buyer&apos;s payment.
                </div>
            ) : null}

            <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,220px)_1fr]">
                <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
                    <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--muted)">
                            Status
                        </p>
                        <nav className="mt-2 flex flex-col gap-1" aria-label="Filter orders by status">
                            {filterItems.map((item) => {
                                const on = statusFilter === item.id;
                                const count = filterCounts[item.id];
                                return (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => setStatusFilter(item.id)}
                                        className={cn(
                                            "flex items-center justify-between rounded-md border px-3 py-2.5 text-left text-xs font-medium transition-colors",
                                            on
                                                ? "border-(--accent)/40 bg-(--accent)/10 text-(--accent) shadow-[inset_3px_0_0_var(--accent)]"
                                                : "border-(--border) bg-[#0b0e14] text-(--muted) hover:border-(--accent)/25 hover:text-foreground"
                                        )}
                                    >
                                        <span className="pr-2 leading-snug">{item.label}</span>
                                        <span
                                            className={cn(
                                                "shrink-0 tabular-nums text-[10px] font-bold",
                                                on ? "text-(--accent)" : "text-(--muted)"
                                            )}
                                        >
                                            {String(count).padStart(2, "0")}
                                        </span>
                                    </button>
                                );
                            })}
                        </nav>
                    </div>
                </aside>

                <div className="min-w-0 space-y-6">
                    <div className="hidden overflow-hidden rounded-lg border border-(--border) bg-[#0b0e14] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] lg:block">
                        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                            <thead className="border-b border-(--border) bg-[#080b10] text-[10px] font-semibold uppercase tracking-wider text-(--muted)">
                                <tr>
                                    <th className="px-4 py-3">Order</th>
                                    <th className="px-4 py-3">Buyer</th>
                                    <th className="px-4 py-3">Status</th>
                                    <th className="px-4 py-3">Payment</th>
                                    <th className="px-4 py-3 text-right">Total</th>
                                    <th className="px-4 py-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pageSlice.map((order) => (
                                    <Fragment key={order.id}>
                                        <tr
                                            className={cn(
                                                "cursor-pointer border-b border-(--border) transition-colors",
                                                selectedOrderId === order.id
                                                    ? "bg-(--accent)/5"
                                                    : "bg-[#0b0e14] hover:bg-(--surface-elevated)/40"
                                            )}
                                            onClick={() => setSelectedOrderId(order.id)}
                                        >
                                            <td className="px-4 py-3 font-mono text-xs text-foreground">
                                                {order.id}
                                            </td>
                                            <td className="px-4 py-3 text-xs text-(--muted)">
                                                {buyerLabel(order.buyerId)}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="flex items-center gap-2">
                                                    <span
                                                        className={cn(
                                                            "h-2 w-2 shrink-0 rounded-sm",
                                                            statusDotClass(order.status)
                                                        )}
                                                    />
                                                    <span className="text-xs font-semibold text-foreground">
                                                        {SELLER_ORDER_STATUS_LABEL[order.status]}
                                                    </span>
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-xs">
                                                <span className="font-semibold text-(--muted)">
                                                    {formatSellerEnumLabel(order.paymentMethod)}
                                                </span>
                                                <span className="mx-1 text-(--border)">·</span>
                                                <span
                                                    className={cn(
                                                        "font-semibold",
                                                        order.paymentStatus === "paid"
                                                            ? "text-emerald-400"
                                                            : "text-amber-300"
                                                    )}
                                                >
                                                    {formatSellerEnumLabel(order.paymentStatus)}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums text-(--accent)">
                                                {formatPeso(order.totalAmount)}
                                            </td>
                                            <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                                <div className="flex flex-wrap justify-end gap-1">
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="outline"
                                                        className={cn(btnOutline, "h-8 text-[10px]")}
                                                        onClick={() => void handleStatusUpdate(order.id, "confirmed")}
                                                        disabled={!canGoTo(order, "confirmed")}
                                                    >
                                                        Confirm
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="outline"
                                                        className={cn(btnOutline, "h-8 text-[10px]")}
                                                        onClick={() =>
                                                            void handleStatusUpdate(order.id, "processing")
                                                        }
                                                        disabled={!canGoTo(order, "processing")}
                                                    >
                                                        Preparing
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="outline"
                                                        className={cn(btnOutline, "h-8 text-[10px]")}
                                                        onClick={() => void handleStatusUpdate(order.id, "shipped")}
                                                        disabled={!canGoTo(order, "shipped")}
                                                    >
                                                        Shipped
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="outline"
                                                        className={cn(btnOutline, "h-8 text-[10px]")}
                                                        onClick={() =>
                                                            void handleStatusUpdate(order.id, "delivered")
                                                        }
                                                        disabled={!canGoTo(order, "delivered")}
                                                    >
                                                        Delivered
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        className={cn(btnPrimary, "h-8 gap-1 text-[10px]")}
                                                        onClick={() => setSelectedOrderId(order.id)}
                                                    >
                                                        <MessageSquare className="h-3.5 w-3.5" aria-hidden />
                                                        Chat
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                        {order.paymentMethod === "online" ? (
                                            <tr className="border-b border-(--border) bg-[#080b10]">
                                                <td colSpan={6} className="px-4 py-2">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <input
                                                            className={cn(inputDark, "max-w-md flex-1")}
                                                            value={receiptNoteByOrder[order.id] ?? ""}
                                                            onChange={(event) =>
                                                                setReceiptNoteByOrder((previous) => ({
                                                                    ...previous,
                                                                    [order.id]: event.target.value
                                                                }))
                                                            }
                                                            placeholder="Note for buyer if payment proof needs to be resent"
                                                        />
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant="outline"
                                                            className={btnOutline}
                                                            onClick={() => void handleReceiptRequest(order.id)}
                                                        >
                                                            Ask buyer to resend proof
                                                        </Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : null}
                                    </Fragment>
                                ))}
                            </tbody>
                        </table>
                        {pageSlice.length === 0 ? (
                            <p className="p-8 text-center text-sm text-(--muted)">
                                No orders in this view. Try another status or check back later.
                            </p>
                        ) : null}
                        <AdminTablePagination
                            page={safePage}
                            totalPages={totalPages}
                            total={filteredOrders.length}
                            limit={PAGE_SIZE}
                            onPageChange={setPage}
                            disabled={false}
                        />
                    </div>

                    <div className="space-y-3 lg:hidden">
                        {pageSlice.map((order) => (
                            <div
                                key={order.id}
                                role="button"
                                tabIndex={0}
                                onClick={() => setSelectedOrderId(order.id)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        setSelectedOrderId(order.id);
                                    }
                                }}
                                className={cn(
                                    "rounded-lg border p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
                                    selectedOrderId === order.id
                                        ? "border-(--accent)/40 bg-(--accent)/5"
                                        : "border-(--border) bg-[#0b0e14]"
                                )}
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <p className="font-mono text-xs text-foreground">{order.id}</p>
                                    <span className="text-sm font-semibold tabular-nums text-(--accent)">
                                        {formatPeso(order.totalAmount)}
                                    </span>
                                </div>
                                <p className="mt-1 text-[11px] text-(--muted)">{buyerLabel(order.buyerId)}</p>
                                <p className="mt-2 flex items-center gap-2 text-xs font-semibold">
                                    <span
                                        className={cn("h-2 w-2 shrink-0 rounded-sm", statusDotClass(order.status))}
                                    />
                                    {SELLER_ORDER_STATUS_LABEL[order.status]}
                                </p>
                                <p className="mt-1 text-[10px] text-(--muted)">
                                    {formatSellerEnumLabel(order.paymentMethod)} ·{" "}
                                    {formatSellerEnumLabel(order.paymentStatus)}
                                </p>
                                <div className="mt-3 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className={btnOutline}
                                        onClick={() => void handleStatusUpdate(order.id, "confirmed")}
                                        disabled={!canGoTo(order, "confirmed")}
                                    >
                                        Confirm
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className={btnOutline}
                                        onClick={() => void handleStatusUpdate(order.id, "processing")}
                                        disabled={!canGoTo(order, "processing")}
                                    >
                                        Preparing
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className={btnOutline}
                                        onClick={() => void handleStatusUpdate(order.id, "shipped")}
                                        disabled={!canGoTo(order, "shipped")}
                                    >
                                        Shipped
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className={btnOutline}
                                        onClick={() => void handleStatusUpdate(order.id, "delivered")}
                                        disabled={!canGoTo(order, "delivered")}
                                    >
                                        Delivered
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        className={btnPrimary}
                                        onClick={() => setSelectedOrderId(order.id)}
                                    >
                                        Chat
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className={btnOutline}
                                        onClick={() => void handlePaymentStatus(order.id, "paid")}
                                        disabled={order.paymentStatus === "paid"}
                                    >
                                        Mark paid
                                    </Button>
                                </div>
                                {order.paymentMethod === "online" ? (
                                    <div className="mt-3 grid gap-2 border-t border-(--border) pt-3">
                                        <input
                                            className={inputDark}
                                            value={receiptNoteByOrder[order.id] ?? ""}
                                            onChange={(event) =>
                                                setReceiptNoteByOrder((previous) => ({
                                                    ...previous,
                                                    [order.id]: event.target.value
                                                }))
                                            }
                                            placeholder="Note if proof needs resending"
                                        />
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            className={btnOutline}
                                            onClick={() => void handleReceiptRequest(order.id)}
                                        >
                                            Ask buyer to resend proof
                                        </Button>
                                    </div>
                                ) : null}
                            </div>
                        ))}
                        {pageSlice.length === 0 ? (
                            <p className="text-center text-sm text-(--muted)">No orders in this view.</p>
                        ) : null}
                        <AdminTablePagination
                            className="rounded-lg border border-(--border) bg-[#0b0e14]"
                            page={safePage}
                            totalPages={totalPages}
                            total={filteredOrders.length}
                            limit={PAGE_SIZE}
                            onPageChange={setPage}
                            disabled={false}
                        />
                    </div>

                    {selectedOrder ? (
                        <div className="grid gap-6 xl:grid-cols-[1fr_minmax(0,340px)]">
                            <Card className="border-(--border) bg-[#0b0e14] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                                <CardHeader className="space-y-4 border-b border-(--border) pb-4">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                        <div>
                                            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--accent)">
                                                {selectedOrder.status !== "delivered"
                                                    ? "Active fulfillment"
                                                    : "Completed"}
                                            </p>
                                            <CardTitle className="mt-1 font-mono text-base text-foreground sm:text-lg">
                                                {selectedOrder.id}
                                            </CardTitle>
                                            <p className="mt-1 text-sm text-(--muted)">
                                                Placed{" "}
                                                {new Date(selectedOrder.createdAt).toLocaleString(undefined, {
                                                    dateStyle: "medium",
                                                    timeStyle: "short"
                                                })}
                                            </p>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className={btnOutline}
                                                onClick={() => openPrintableOrderSummary(selectedOrder)}
                                            >
                                                <Printer className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                                                Print summary
                                            </Button>
                                        </div>
                                    </div>
                                    <OrderPipelineStepper order={selectedOrder} />
                                    <div className="flex flex-wrap gap-2 border-t border-(--border) pt-4">
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            className={btnOutline}
                                            onClick={() =>
                                                void handleStatusUpdate(selectedOrder.id, "confirmed")
                                            }
                                            disabled={!canGoTo(selectedOrder, "confirmed")}
                                        >
                                            Confirm order
                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            className={btnOutline}
                                            onClick={() =>
                                                void handleStatusUpdate(selectedOrder.id, "processing")
                                            }
                                            disabled={!canGoTo(selectedOrder, "processing")}
                                        >
                                            Start preparing
                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            className={btnOutline}
                                            onClick={() =>
                                                void handleStatusUpdate(selectedOrder.id, "shipped")
                                            }
                                            disabled={!canGoTo(selectedOrder, "shipped")}
                                        >
                                            Mark shipped
                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            className={btnPrimary}
                                            onClick={() =>
                                                void handleStatusUpdate(selectedOrder.id, "delivered")
                                            }
                                            disabled={!canGoTo(selectedOrder, "delivered")}
                                        >
                                            Mark delivered
                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            className={btnOutline}
                                            onClick={() =>
                                                void handlePaymentStatus(selectedOrder.id, "paid")
                                            }
                                            disabled={selectedOrder.paymentStatus === "paid"}
                                        >
                                            Mark paid
                                        </Button>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-4 pt-4">
                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <div className="rounded-lg border border-(--border) bg-[#080b10] p-4">
                                            <p className="text-[10px] font-semibold uppercase tracking-wider text-(--muted)">
                                                Buyer
                                            </p>
                                            <p className="mt-2 font-mono text-xs text-foreground">
                                                {selectedOrder.buyerId}
                                            </p>
                                            <p className="mt-1 text-[11px] text-(--muted)">
                                                We only store the buyer account ID. Use order messages to
                                                coordinate delivery details.
                                            </p>
                                        </div>
                                        <div className="rounded-lg border border-(--border) bg-[#080b10] p-4">
                                            <p className="text-[10px] font-semibold uppercase tracking-wider text-(--muted)">
                                                Payment & proof
                                            </p>
                                            <p className="mt-2 text-sm text-foreground">
                                                {formatSellerEnumLabel(selectedOrder.paymentMethod)} ·{" "}
                                                <span
                                                    className={
                                                        selectedOrder.paymentStatus === "paid"
                                                            ? "text-emerald-400"
                                                            : "text-amber-300"
                                                    }
                                                >
                                                    {formatSellerEnumLabel(selectedOrder.paymentStatus)}
                                                </span>
                                            </p>
                                            <p className="mt-2 text-xs text-(--muted)">
                                                Proof status:{" "}
                                                <span className="font-medium text-foreground">
                                                    {formatSellerEnumLabel(selectedOrder.receiptStatus)}
                                                </span>
                                            </p>
                                            {selectedOrder.paymentReference ? (
                                                <p className="mt-1 break-all text-[11px] text-(--muted)">
                                                    Reference: {selectedOrder.paymentReference}
                                                </p>
                                            ) : null}
                                            {selectedOrder.receiptRequestNote ? (
                                                <p className="mt-2 rounded border border-(--border) bg-(--surface) p-2 text-[11px] text-(--muted)">
                                                    Your note to buyer: {selectedOrder.receiptRequestNote}
                                                </p>
                                            ) : null}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="border-(--border) bg-[#0b0e14] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                                <CardHeader className="border-b border-(--border) pb-3">
                                    <div className="border-l-2 border-(--accent) pl-3">
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--accent)">
                                            Order messages
                                        </p>
                                        <CardTitle className="mt-1 text-base font-semibold">
                                            Chat with buyer
                                        </CardTitle>
                                        <p className="mt-1 text-xs text-(--muted)">
                                            Real-time when this page is open. Same thread the buyer sees on
                                            their order.
                                        </p>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-3 pt-4">
                                    <div className="max-h-72 space-y-2 overflow-y-auto rounded-md border border-(--border) bg-[#080b10] p-3">
                                        {messages.map((message) => {
                                            const mine =
                                                Boolean(sellerUserId) && message.senderId === sellerUserId;
                                            return (
                                                <div
                                                    key={message.id}
                                                    className={cn(
                                                        "rounded-lg border px-3 py-2 text-xs",
                                                        mine
                                                            ? "ml-4 border-(--accent)/30 bg-(--accent)/10"
                                                            : "mr-4 border-(--border) bg-(--surface-elevated)"
                                                    )}
                                                >
                                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-(--accent)">
                                                        {mine ? "You" : "Buyer"}
                                                    </p>
                                                    <p className="mt-1 text-foreground">{message.body}</p>
                                                    <p className="mt-1 text-[10px] text-(--muted)">
                                                        {new Date(message.createdAt).toLocaleString()}
                                                    </p>
                                                </div>
                                            );
                                        })}
                                        {messages.length === 0 ? (
                                            <p className="py-6 text-center text-sm text-(--muted)">
                                                No messages yet.
                                            </p>
                                        ) : null}
                                    </div>
                                    <div className="flex gap-2">
                                        <input
                                            className={cn(inputDark, "h-10 flex-1 text-sm")}
                                            value={messageInput}
                                            onChange={(event) => setMessageInput(event.target.value)}
                                            placeholder="Message the buyer about this order…"
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter" && !e.shiftKey) {
                                                    e.preventDefault();
                                                    void handleSendMessage();
                                                }
                                            }}
                                        />
                                        <Button
                                            type="button"
                                            className={cn(btnPrimary, "shrink-0 px-5")}
                                            onClick={() => void handleSendMessage()}
                                        >
                                            Send
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    ) : (
                        <p className="rounded-lg border border-dashed border-(--border) bg-[#0b0e14] px-4 py-8 text-center text-sm text-(--muted)">
                            Select an order from the table to see the fulfillment checklist and messages.
                        </p>
                    )}

                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-(--muted)">
                        <span>Mizaweb seller orders</span>
                        <ChevronRight className="h-3 w-3 opacity-50" aria-hidden />
                        <span className="tabular-nums">{new Date().toISOString().slice(0, 19)} UTC</span>
                    </p>
                </div>
            </div>
        </div>
    );
}
