"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { ArrowLeft, Check, CircleX, Plus, Printer, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
    cancelOrderBySeller,
    getOrderById,
    getOrderMessages,
    getOrderPaymentReceiptReadUrl,
    getProductDetail,
    requestReceiptResubmission,
    sendOrderMessage,
    updateOrderFulfillmentShipping,
    updateOrderPaymentStatus,
    updateOrderStatus
} from "@/lib/api/endpoints";
import { formatCartSelectionsLine } from "@/lib/format-cart-selections";
import { normalizeCartItemSelections } from "@/lib/normalize-cart-item-selections";
import {
    emptyQualityChecklist,
    isQualityChecklistCompleteForConfirm,
    newQualityChecklistItem,
    QUALITY_CHECKLIST_MAX_ITEMS
} from "@/lib/order-quality-checklist";
import { formatSellerEnumLabel } from "@/lib/seller-display";
import { cn, formatPeso } from "@/lib/utils";
import type { Order, OrderLineItem, OrderMessage, ProductDetail } from "@/types";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

const PIPELINE: { status: Order["status"]; num: string; label: string }[] = [
    { status: "created", num: "01", label: "Order placed" },
    { status: "confirmed", num: "02", label: "Confirmed" },
    { status: "processing", num: "03", label: "Packing" },
    { status: "shipped", num: "04", label: "Shipping" },
    { status: "delivered", num: "05", label: "Delivered" }
];

function pipelineIndex(status: Order["status"]): number {
    if (status === "cancelled") {
        return -1;
    }
    return PIPELINE.findIndex((s) => s.status === status);
}

function canGoTo(
    order: Order,
    target: "confirmed" | "processing" | "shipped" | "delivered"
): boolean {
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

/** First allowed step in the fulfillment chain (used to highlight the real “next” action). */
function nextFulfillmentAction(
    order: Order
): "confirmed" | "processing" | "shipped" | "delivered" | null {
    if (order.status === "cancelled") {
        return null;
    }
    if (canGoTo(order, "confirmed")) {
        return "confirmed";
    }
    if (canGoTo(order, "processing")) {
        return "processing";
    }
    if (canGoTo(order, "shipped")) {
        return "shipped";
    }
    if (canGoTo(order, "delivered")) {
        return "delivered";
    }
    return null;
}

const fulfillmentBtnPrimary =
    "h-10 bg-(--accent) px-4 text-xs font-bold uppercase tracking-wide text-[#030608] hover:brightness-110 disabled:opacity-40 disabled:hover:brightness-100";
const fulfillmentBtnSecondary =
    "h-10 border border-white/15 px-4 text-xs font-bold uppercase tracking-wide hover:bg-white/5 disabled:opacity-40";

function openPrintManifest(
    order: Order,
    lineItems: OrderLineItem[],
    buyerDisplayName: string,
    productTitles: Record<string, string>
): void {
    const lines = [
        "Order summary",
        `Order ID: ${order.id}`,
        `Customer: ${buyerDisplayName}`,
        `Status: ${order.status}`,
        `Payment: ${order.paymentMethod} — ${order.paymentStatus}`,
        `Total: ${formatPeso(order.totalAmount)}`,
        `Placed: ${new Date(order.createdAt).toLocaleString()}`,
        ...(order.status === "cancelled"
            ? [
                  "Status: CANCELLED",
                  ...(order.cancellationReason ? [`Reason: ${order.cancellationReason}`] : [])
              ]
            : []),
        ...(order.qualityChecklist?.items?.length
            ? [
                  "",
                  "Quality checklist (at confirm):",
                  ...order.qualityChecklist.items.map((item) => {
                      return `  [${item.checked ? "✓" : " "}] ${item.label}`;
                  })
              ]
            : []),
        "",
        ...(order.fulfillmentCarrierName?.trim()
            ? [`Carrier: ${order.fulfillmentCarrierName.trim()}`]
            : []),
        ...(order.fulfillmentTrackingNumber?.trim()
            ? [`Tracking: ${order.fulfillmentTrackingNumber.trim()}`]
            : []),
        ...(order.fulfillmentNotes?.trim()
            ? ["Notes:", `  ${order.fulfillmentNotes.trim().replace(/\n/g, "\n  ")}`]
            : []),
        ...(order.fulfillmentCarrierName?.trim() ||
        order.fulfillmentTrackingNumber?.trim() ||
        order.fulfillmentNotes?.trim()
            ? [""]
            : []),
        "Ordered items:"
    ];
    for (const li of lineItems) {
        lines.push(`  - ${productTitles[li.productId] ?? li.productId} × ${li.quantity}`);
    }
    const w = window.open("", "_blank", "width=640,height=720");
    if (!w) {
        return;
    }
    w.document.write(
        `<!DOCTYPE html><html><head><title>Order ${order.id}</title>
        <style>body{font-family:system-ui,sans-serif;padding:24px;background:#111;color:#eee;line-height:1.5}</style></head><body><pre>${lines.join("\n")}</pre></body></html>`
    );
    w.document.close();
    w.focus();
    w.print();
    w.close();
}

const inputDark =
    "h-10 w-full rounded-md border border-white/15 bg-[#080b10] px-3 text-sm text-foreground placeholder:text-(--muted) focus-visible:border-(--accent)/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/25";

const textareaDark =
    "min-h-[104px] w-full rounded-md border border-white/15 bg-[#080b10] px-3 py-2.5 text-sm text-foreground placeholder:text-(--muted) focus-visible:border-(--accent)/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/25";

export function SellerOrderFulfillmentClient({ orderId }: { orderId: string }) {
    const router = useRouter();
    const [order, setOrder] = useState<Order | null>(null);
    const [lineItems, setLineItems] = useState<OrderLineItem[]>([]);
    const [buyerDisplayName, setBuyerDisplayName] = useState("");
    const [productMap, setProductMap] = useState<Record<string, ProductDetail>>({});
    const [loading, setLoading] = useState(true);
    const [messages, setMessages] = useState<OrderMessage[]>([]);
    const [messageInput, setMessageInput] = useState("");
    const [receiptNote, setReceiptNote] = useState("");
    const [cancelModalOpen, setCancelModalOpen] = useState(false);
    const [cancelReason, setCancelReason] = useState("");
    const [cancelSubmitting, setCancelSubmitting] = useState(false);
    const [paymentProofBusy, setPaymentProofBusy] = useState(false);
    const [sellerUserId, setSellerUserId] = useState("");
    const [receiptReadUrl, setReceiptReadUrl] = useState<string | null>(null);
    const [receiptReadError, setReceiptReadError] = useState<string | null>(null);
    const [receiptLoading, setReceiptLoading] = useState(false);
    const [showReceiptThumb, setShowReceiptThumb] = useState(true);
    const [showReceiptFull, setShowReceiptFull] = useState(true);
    const [qualityDraft, setQualityDraft] = useState(emptyQualityChecklist);
    const [fulfillmentCarrier, setFulfillmentCarrier] = useState("");
    const [fulfillmentTracking, setFulfillmentTracking] = useState("");
    const [fulfillmentNotes, setFulfillmentNotes] = useState("");
    const [fulfillmentSaving, setFulfillmentSaving] = useState(false);
    const orderIdRef = useRef(orderId);
    orderIdRef.current = orderId;

    const syncReceiptPreview = useCallback(
        async (current: Order | null) => {
            if (
                !orderId.trim() ||
                !current ||
                current.paymentMethod !== "online" ||
                !current.receiptProofUrl?.trim()
            ) {
                setReceiptReadUrl(null);
                setReceiptReadError(null);
                setReceiptLoading(false);
                setShowReceiptThumb(true);
                setShowReceiptFull(true);
                return;
            }
            setReceiptLoading(true);
            setReceiptReadError(null);
            try {
                const r = await getOrderPaymentReceiptReadUrl(orderId);
                setReceiptReadUrl(r.data.readUrl);
                setShowReceiptThumb(true);
                setShowReceiptFull(true);
            } catch {
                setReceiptReadUrl(null);
                setReceiptReadError("Could not load receipt preview.");
            } finally {
                setReceiptLoading(false);
            }
        },
        [orderId]
    );

    const syncReceiptPreviewRef = useRef(syncReceiptPreview);
    syncReceiptPreviewRef.current = syncReceiptPreview;

    const loadOrder = useCallback(async () => {
        if (!orderId.trim()) {
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const res = await getOrderById(orderId);
            const loaded = res.data.order;
            setOrder(loaded);
            setLineItems(
                res.data.lineItems.map((li) => ({
                    ...li,
                    selections: normalizeCartItemSelections(li.selections)
                }))
            );
            setBuyerDisplayName(res.data.buyerDisplayName ?? loaded.buyerId);
            const map: Record<string, ProductDetail> = {};
            const ids = [...new Set(res.data.lineItems.map((l) => l.productId))];
            await Promise.all(
                ids.map(async (pid) => {
                    try {
                        const r = await getProductDetail(pid);
                        map[pid] = r.data;
                    } catch {
                        /* skip */
                    }
                })
            );
            setProductMap(map);
            await syncReceiptPreview(loaded);
        } catch {
            setOrder(null);
            setLineItems([]);
            await syncReceiptPreview(null);
            toast.error("Could not load this order.");
        } finally {
            setLoading(false);
        }
    }, [orderId, syncReceiptPreview]);

    useEffect(() => {
        void loadOrder();
    }, [loadOrder]);

    useEffect(() => {
        if (!order) {
            return;
        }
        setFulfillmentCarrier(order.fulfillmentCarrierName ?? "");
        setFulfillmentTracking(order.fulfillmentTrackingNumber ?? "");
        setFulfillmentNotes(order.fulfillmentNotes ?? "");
    }, [order]);

    useEffect(() => {
        if (!orderId.trim()) {
            return;
        }
        setQualityDraft(emptyQualityChecklist());
    }, [orderId]);

    useEffect(() => {
        try {
            const raw = localStorage.getItem("miza_user");
            const u = raw ? (JSON.parse(raw) as { id?: string }) : null;
            if (u?.id) {
                setSellerUserId(u.id);
            }
        } catch {
            setSellerUserId("");
        }
    }, []);

    useEffect(() => {
        if (!orderId) {
            setMessages([]);
            return;
        }
        getOrderMessages(orderId)
            .then((r) => setMessages(Array.isArray(r.data) ? r.data : []))
            .catch(() => {
                setMessages([]);
                toast.error("Could not load messages for this order.");
            });
    }, [orderId]);

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
        socket.on("order:updated", (o: Order) => {
            if (o.id === orderIdRef.current) {
                setOrder(o);
                void syncReceiptPreviewRef.current(o);
            }
        });
        socket.on("chat:message", (message: OrderMessage) => {
            if (message.orderId !== orderIdRef.current) {
                return;
            }
            setMessages((prev) => {
                if (prev.some((m) => m.id === message.id)) {
                    return prev;
                }
                return [...prev, message].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
            });
        });
        if (!token) {
            socket.disconnect();
        }
        return () => {
            socket.off("connect", joinUserChannel);
            socket.disconnect();
        };
    }, []);

    const firstLine = lineItems[0];
    const primaryProduct = firstLine ? productMap[firstLine.productId] : undefined;
    const mainItemSelectionsText = useMemo(
        () => formatCartSelectionsLine(primaryProduct, firstLine?.selections),
        [primaryProduct, firstLine]
    );
    const thumb = primaryProduct?.thumbnailUrl?.trim() || primaryProduct?.media[0]?.url || null;
    const sizeLine = useMemo(() => {
        if (!primaryProduct) {
            return null;
        }
        const dims = primaryProduct.options.find(
            (o) =>
                o.name.toLowerCase().includes("dimension") || o.name.toLowerCase().includes("size")
        );
        if (dims?.values.length) {
            return `Options include: ${dims.name} (${dims.values.slice(0, 4).join(", ")}${dims.values.length > 4 ? "…" : ""})`;
        }
        return "Add size notes in messages if the buyer chose custom measurements.";
    }, [primaryProduct]);

    async function handleStatus(status: "confirmed" | "processing" | "shipped" | "delivered") {
        if (!order) {
            return;
        }
        try {
            if (status === "confirmed") {
                await updateOrderStatus(order.id, {
                    status: "confirmed",
                    qualityChecklist: qualityDraft
                });
            } else {
                await updateOrderStatus(order.id, { status });
            }
            await loadOrder();
            toast.success("Status updated.");
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Update failed.");
        }
    }

    async function handleSaveFulfillmentShipping() {
        if (!order || order.status === "cancelled") {
            return;
        }
        setFulfillmentSaving(true);
        try {
            await updateOrderFulfillmentShipping(order.id, {
                fulfillmentCarrierName: fulfillmentCarrier,
                fulfillmentTrackingNumber: fulfillmentTracking,
                fulfillmentNotes: fulfillmentNotes
            });
            await loadOrder();
            toast.success("Shipping details saved. The buyer can see them on their order.");
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not save shipping details.");
        } finally {
            setFulfillmentSaving(false);
        }
    }

    async function handlePaid() {
        if (!order) {
            return;
        }
        setPaymentProofBusy(true);
        try {
            await updateOrderPaymentStatus(order.id, "paid");
            await loadOrder();
            toast.success("Payment confirmed.");
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not update payment.");
        } finally {
            setPaymentProofBusy(false);
        }
    }

    async function handleReceiptRequest() {
        if (!order) {
            return;
        }
        if (order.paymentStatus === "paid" || order.receiptStatus === "approved") {
            return;
        }
        const note = receiptNote.trim();
        if (note.length < 5) {
            toast.error("Please enter at least 5 characters in the note to the buyer.");
            return;
        }
        setPaymentProofBusy(true);
        try {
            await requestReceiptResubmission(order.id, note);
            setReceiptNote("");
            await loadOrder();
            toast.success(
                "Request sent to the buyer. They can upload a new receipt from My Orders."
            );
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Request failed.");
        } finally {
            setPaymentProofBusy(false);
        }
    }

    async function handleSendMessage() {
        const body = messageInput.trim();
        if (!orderId || !body) {
            return;
        }
        try {
            const res = await sendOrderMessage(orderId, body);
            setMessageInput("");
            setMessages((prev) => {
                const message = res.data;
                if (prev.some((m) => m.id === message.id)) {
                    return prev;
                }
                return [...prev, message].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
            });
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not send message.");
        }
    }

    async function handleConfirmCancelOrder() {
        if (!order || cancelReason.trim().length < 10) {
            return;
        }
        setCancelSubmitting(true);
        try {
            await cancelOrderBySeller(order.id, cancelReason.trim());
            setCancelModalOpen(false);
            setCancelReason("");
            const res = await getOrderMessages(orderId);
            setMessages(res.data);
            await loadOrder();
            toast.success("Order cancelled. The buyer can see your reason in messages.");
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not cancel order.");
        } finally {
            setCancelSubmitting(false);
        }
    }

    const productTitles = useMemo(() => {
        const m: Record<string, string> = {};
        for (const li of lineItems) {
            m[li.productId] = productMap[li.productId]?.title ?? li.productId;
        }
        return m;
    }, [lineItems, productMap]);

    if (!orderId.trim()) {
        return (
            <div className="p-6">
                <p className="text-sm text-(--muted)">Missing order.</p>
                <Link href="/seller/orders" className="mt-4 inline-block text-(--accent)">
                    Back to orders
                </Link>
            </div>
        );
    }

    if (loading || !order) {
        return (
            <div className="p-6">
                <p className="text-sm text-(--muted)">
                    {loading ? "Loading order…" : "Order not found."}
                </p>
                {!loading ? (
                    <Link href="/seller/orders" className="mt-4 inline-block text-(--accent)">
                        Back to orders
                    </Link>
                ) : null}
            </div>
        );
    }

    const idx = pipelineIndex(order.status);
    const isCancelled = order.status === "cancelled";
    const qualityChecklistInteractive = order.status === "created" && !isCancelled;
    const savedQuality = order.qualityChecklist;
    const allQualityChecked = isQualityChecklistCompleteForConfirm(qualityDraft);
    const nextAction = nextFulfillmentAction(order);
    const confirmBlockedByChecklist =
        order.status === "created" && !isCancelled && !allQualityChecked;
    const receiptResendLocked =
        order.paymentStatus === "paid" || order.receiptStatus === "approved";

    return (
        <div className="bg-[#050508]/40 p-4 md:p-6 lg:p-8">
            <button
                type="button"
                onClick={() => router.push("/seller/orders")}
                className="mb-6 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-(--muted) hover:text-(--accent)"
            >
                <ArrowLeft className="h-4 w-4" aria-hidden />
                All orders
            </button>

            <div className="flex flex-col gap-4 border-b border-white/10 pb-6 lg:flex-row lg:items-start lg:justify-between">
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.26em] text-(--accent)">
                        {isCancelled
                            ? "Cancelled order"
                            : order.status !== "delivered"
                              ? "Active Order"
                              : "Completed order"}
                    </p>
                    <h1 className="mt-2 font-mono text-xl text-(--accent) md:text-2xl">
                        {order.id}
                    </h1>
                    <p className="mt-2 text-lg font-semibold text-foreground">
                        {primaryProduct?.title ?? "Order items"}
                    </p>
                    <p className="mt-1 text-sm text-(--muted)">
                        Placed{" "}
                        {new Date(order.createdAt).toLocaleString(undefined, {
                            dateStyle: "medium",
                            timeStyle: "short"
                        })}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() =>
                            openPrintManifest(order, lineItems, buyerDisplayName, productTitles)
                        }
                        className="h-11 border border-white/20 bg-transparent px-5 text-xs font-bold uppercase tracking-wide text-foreground hover:bg-white/5"
                    >
                        <span className="inline-flex items-center gap-2">
                            <Printer className="h-4 w-4" aria-hidden />
                            Print summary
                        </span>
                    </button>
                </div>
            </div>

            {isCancelled ? (
                <div
                    className="mt-8 rounded-lg border border-red-500/35 bg-red-500/10 p-5"
                    role="status"
                >
                    <p className="text-[10px] font-bold uppercase tracking-wider text-red-200">
                        Order cancelled
                    </p>
                    {order.cancellationReason ? (
                        <p className="mt-2 text-sm leading-relaxed text-foreground">
                            {order.cancellationReason}
                        </p>
                    ) : (
                        <p className="mt-2 text-sm text-(--muted)">No reason was stored.</p>
                    )}
                    <p className="mt-3 text-xs text-(--muted)">
                        Fulfillment actions are disabled. The buyer was notified in the order
                        thread.
                    </p>
                </div>
            ) : (
                <div className="mt-8 overflow-x-auto pb-2">
                    <ol className="flex min-w-[640px] items-start gap-0">
                        {PIPELINE.map((step, i) => {
                            const done = i < idx;
                            const current = i === idx;
                            return (
                                <li key={step.status} className="flex flex-1 flex-col items-center">
                                    <div className="flex w-full items-center">
                                        <div
                                            className={cn(
                                                "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold",
                                                done &&
                                                    "border-emerald-500/50 bg-emerald-500/15 text-emerald-200",
                                                current &&
                                                    "border-(--accent) bg-(--accent)/15 text-(--accent) shadow-[0_0_16px_rgba(34,199,243,0.2)]",
                                                !done &&
                                                    !current &&
                                                    "border-white/15 bg-[#080b10] text-(--muted)"
                                            )}
                                        >
                                            {done ? (
                                                <Check className="h-4 w-4" aria-hidden />
                                            ) : (
                                                step.num
                                            )}
                                        </div>
                                        {i < PIPELINE.length - 1 ? (
                                            <div
                                                className={cn(
                                                    "mx-1 mt-5 hidden h-px min-w-[8px] flex-1 sm:block",
                                                    i < idx ? "bg-emerald-500/40" : "bg-white/10"
                                                )}
                                            />
                                        ) : null}
                                    </div>
                                    <p
                                        className={cn(
                                            "mt-2 text-center text-[9px] font-bold uppercase tracking-wider",
                                            current ? "text-(--accent)" : "text-(--muted)"
                                        )}
                                    >
                                        {step.label}
                                    </p>
                                </li>
                            );
                        })}
                    </ol>
                </div>
            )}

            <div className="mt-10 grid gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="space-y-6">
                    <div className="grid gap-6 lg:grid-cols-2">
                        <div className="border border-white/10 bg-[#0e131c] p-5">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-(--muted)">
                                Main item
                            </p>
                            <div className="mt-4 aspect-4/3 max-h-56 w-full overflow-hidden bg-[#12161f]">
                                {thumb ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={thumb}
                                        alt=""
                                        className="h-full w-full object-cover"
                                    />
                                ) : (
                                    <div className="flex h-full items-center justify-center text-(--muted)">
                                        No image
                                    </div>
                                )}
                            </div>
                            <p className="mt-4 text-[10px] font-semibold uppercase tracking-wider text-(--muted)">
                                Size &amp; measurements
                            </p>

                            {firstLine ? (
                                <div className="mt-2 space-y-2 text-xs text-(--muted)">
                                    {mainItemSelectionsText ? (
                                        <p className="text-foreground">{mainItemSelectionsText}</p>
                                    ) : null}
                                    {!mainItemSelectionsText && primaryProduct?.options?.length ? (
                                        <>
                                            {sizeLine ? <p>{sizeLine}</p> : null}
                                            <p>
                                                The buyer&apos;s exact option choice was not stored
                                                on this order line (for example, the order may
                                                predate saved checkout selections). Confirm with the
                                                buyer if needed.
                                            </p>
                                        </>
                                    ) : null}
                                    {!mainItemSelectionsText && !primaryProduct?.options?.length ? (
                                        <p>Selections from checkout appear here when available.</p>
                                    ) : null}
                                </div>
                            ) : null}
                        </div>

                        <div
                            id="seller-order-quality-checklist"
                            className="border border-white/10 bg-[#0e131c] p-5"
                        >
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-(--muted)">
                                Quality checklist
                            </p>
                            {qualityChecklistInteractive ? (
                                <>
                                    <ul className="mt-4 space-y-3 text-sm text-foreground">
                                        {qualityDraft.items.map((row) => (
                                            <li
                                                key={row.id}
                                                className="flex flex-col gap-2 sm:flex-row sm:items-center"
                                            >
                                                <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3 leading-snug">
                                                    <input
                                                        type="checkbox"
                                                        checked={row.checked}
                                                        onChange={(e) =>
                                                            setQualityDraft((d) => ({
                                                                ...d,
                                                                items: d.items.map((it) =>
                                                                    it.id === row.id
                                                                        ? {
                                                                              ...it,
                                                                              checked:
                                                                                  e.target.checked
                                                                          }
                                                                        : it
                                                                )
                                                            }))
                                                        }
                                                        className="mt-2 h-4 w-4 shrink-0 rounded border border-white/25 bg-[#080b10] accent-(--accent) focus-visible:ring-2 focus-visible:ring-(--accent)/30 sm:mt-2.5"
                                                    />
                                                    <input
                                                        type="text"
                                                        value={row.label}
                                                        onChange={(e) =>
                                                            setQualityDraft((d) => ({
                                                                ...d,
                                                                items: d.items.map((it) =>
                                                                    it.id === row.id
                                                                        ? {
                                                                              ...it,
                                                                              label: e.target.value
                                                                          }
                                                                        : it
                                                                )
                                                            }))
                                                        }
                                                        maxLength={500}
                                                        placeholder="What to verify before you ship…"
                                                        className={cn(
                                                            inputDark,
                                                            "min-h-11 flex-1 py-2"
                                                        )}
                                                        aria-label="Checklist line text"
                                                    />
                                                </label>
                                                <button
                                                    type="button"
                                                    disabled={qualityDraft.items.length <= 1}
                                                    onClick={() =>
                                                        setQualityDraft((d) => ({
                                                            ...d,
                                                            items: d.items.filter(
                                                                (it) => it.id !== row.id
                                                            )
                                                        }))
                                                    }
                                                    className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 border border-white/15 px-3 text-[10px] font-bold uppercase tracking-wide text-(--muted) hover:border-red-500/40 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-30"
                                                    aria-label="Remove checklist line"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                                                    Remove
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                    <button
                                        type="button"
                                        disabled={
                                            qualityDraft.items.length >= QUALITY_CHECKLIST_MAX_ITEMS
                                        }
                                        onClick={() =>
                                            setQualityDraft((d) => ({
                                                ...d,
                                                items: [...d.items, newQualityChecklistItem()]
                                            }))
                                        }
                                        className="mt-4 inline-flex h-10 items-center gap-2 border border-(--accent)/40 bg-(--accent)/10 px-4 text-[10px] font-bold uppercase tracking-wide text-(--accent) hover:bg-(--accent)/15 disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                        <Plus className="h-4 w-4" aria-hidden />
                                        Add checklist item
                                    </button>
                                </>
                            ) : savedQuality?.items?.length ? (
                                <ul className="mt-4 space-y-3 text-sm text-(--muted)">
                                    {savedQuality.items.map((row) => (
                                        <li key={row.id} className="flex gap-2">
                                            <Check
                                                className={cn(
                                                    "mt-0.5 h-4 w-4 shrink-0",
                                                    row.checked
                                                        ? "text-emerald-400"
                                                        : "text-white/15"
                                                )}
                                                aria-hidden
                                            />
                                            <span
                                                className={row.checked ? "" : "text-foreground/45"}
                                            >
                                                {row.label}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            ) : !savedQuality &&
                              !qualityChecklistInteractive &&
                              !isCancelled &&
                              order.status !== "created" ? (
                                <p className="mt-4 text-xs text-(--muted)">
                                    No checklist was stored (order may predate this feature).
                                </p>
                            ) : null}
                            <p className="mt-4 text-xs italic text-(--muted)">
                                {qualityChecklistInteractive
                                    ? "Edit the default lines, add your own shop checks, then tick every box before you confirm—the buyer sees this list after confirmation."
                                    : "Use your usual shop checklist—this is a reminder before you ship."}
                            </p>
                        </div>
                    </div>

                    <div className="border border-white/10 bg-[#0e131c] p-5">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-(--muted)">
                            Shipping details
                        </p>
                        <p className="mt-2 text-xs leading-relaxed text-(--muted)">
                            Optional — add courier, tracking, or meet-up notes here. When you save,
                            the buyer sees this on{" "}
                            <strong className="text-foreground/90">My orders</strong>. Leave blank
                            if you prefer to coordinate only in messages.
                        </p>
                        <div className="mt-4 space-y-4">
                            <label className="block">
                                <span className="text-[10px] font-semibold uppercase tracking-wider text-(--muted)">
                                    Courier / carrier name
                                </span>
                                <input
                                    type="text"
                                    value={fulfillmentCarrier}
                                    onChange={(e) => setFulfillmentCarrier(e.target.value)}
                                    disabled={order.status === "cancelled"}
                                    placeholder="e.g. J&T, LBC, Grab Express"
                                    className={cn("mt-1.5", inputDark)}
                                    autoComplete="off"
                                />
                            </label>
                            <label className="block">
                                <span className="text-[10px] font-semibold uppercase tracking-wider text-(--muted)">
                                    Tracking number
                                </span>
                                <input
                                    type="text"
                                    value={fulfillmentTracking}
                                    onChange={(e) => setFulfillmentTracking(e.target.value)}
                                    disabled={order.status === "cancelled"}
                                    placeholder="Tracking or reference ID"
                                    className={cn("mt-1.5 font-mono text-sm", inputDark)}
                                    autoComplete="off"
                                />
                            </label>
                            <label className="block">
                                <span className="text-[10px] font-semibold uppercase tracking-wider text-(--muted)">
                                    Other details
                                </span>
                                <textarea
                                    value={fulfillmentNotes}
                                    onChange={(e) => setFulfillmentNotes(e.target.value)}
                                    disabled={order.status === "cancelled"}
                                    placeholder="Meet-up location & time, handling notes, expected arrival, etc."
                                    rows={4}
                                    className={cn("mt-1.5 resize-y", textareaDark)}
                                />
                            </label>
                            {order.status === "cancelled" ? (
                                <p className="text-xs text-(--muted)">
                                    This order is cancelled — shipping details cannot be edited.
                                </p>
                            ) : (
                                <button
                                    type="button"
                                    disabled={fulfillmentSaving}
                                    onClick={() => void handleSaveFulfillmentShipping()}
                                    className={cn(
                                        fulfillmentBtnSecondary,
                                        "disabled:cursor-not-allowed disabled:opacity-40"
                                    )}
                                >
                                    {fulfillmentSaving ? "Saving…" : "Save shipping details"}
                                </button>
                            )}
                        </div>
                    </div>

                    {!isCancelled ? (
                        <div className="border-t border-white/10 pt-6">
                            {confirmBlockedByChecklist ? (
                                <p
                                    className="mb-3 rounded-md border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-sm text-amber-100/95"
                                    role="status"
                                >
                                    <strong className="font-semibold text-amber-50">
                                        Almost there.
                                    </strong>{" "}
                                    Tick every box in the{" "}
                                    <a
                                        href="#seller-order-quality-checklist"
                                        className="font-semibold text-(--accent) underline-offset-2 hover:underline"
                                    >
                                        quality checklist
                                    </a>{" "}
                                    (including any lines you added). Each line must keep some text
                                    and be checked—then you can confirm the order.
                                </p>
                            ) : null}
                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    disabled={
                                        !canGoTo(order, "confirmed") ||
                                        (order.status === "created" && !allQualityChecked)
                                    }
                                    title={
                                        confirmBlockedByChecklist
                                            ? "Complete every quality checklist item first"
                                            : undefined
                                    }
                                    onClick={() => void handleStatus("confirmed")}
                                    className={cn(
                                        nextAction === "confirmed"
                                            ? fulfillmentBtnPrimary
                                            : fulfillmentBtnSecondary
                                    )}
                                >
                                    Confirm order
                                </button>
                                <button
                                    type="button"
                                    disabled={!canGoTo(order, "processing")}
                                    onClick={() => void handleStatus("processing")}
                                    className={cn(
                                        nextAction === "processing"
                                            ? fulfillmentBtnPrimary
                                            : fulfillmentBtnSecondary
                                    )}
                                >
                                    Mark as Packed
                                </button>
                                <button
                                    type="button"
                                    disabled={!canGoTo(order, "shipped")}
                                    onClick={() => void handleStatus("shipped")}
                                    className={cn(
                                        nextAction === "shipped"
                                            ? fulfillmentBtnPrimary
                                            : fulfillmentBtnSecondary
                                    )}
                                >
                                    Mark as shipped
                                </button>
                                <button
                                    type="button"
                                    disabled={!canGoTo(order, "delivered")}
                                    onClick={() => void handleStatus("delivered")}
                                    className={cn(
                                        nextAction === "delivered"
                                            ? fulfillmentBtnPrimary
                                            : fulfillmentBtnSecondary
                                    )}
                                >
                                    Mark delivered
                                </button>
                                {order.paymentMethod === "cash" ? (
                                    <button
                                        type="button"
                                        disabled={
                                            order.paymentStatus === "paid" || paymentProofBusy
                                        }
                                        onClick={() => void handlePaid()}
                                        className={fulfillmentBtnSecondary}
                                    >
                                        Mark as paid
                                    </button>
                                ) : null}
                                <button
                                    type="button"
                                    onClick={() => setCancelModalOpen(true)}
                                    className="inline-flex h-10 items-center gap-2 border border-red-500/45 px-4 text-xs font-bold uppercase tracking-wide text-red-200 hover:bg-red-500/10"
                                >
                                    <CircleX className="h-4 w-4 shrink-0" aria-hidden />
                                    Cancel / decline order
                                </button>
                            </div>
                        </div>
                    ) : null}

                    {order.paymentMethod === "online" && !isCancelled ? (
                        <div className="border border-white/10 bg-[#080b10] p-4">
                            <p className="text-[10px] font-semibold uppercase text-(--muted)">
                                Payment proof
                            </p>

                            <div className="mt-3 rounded-lg border border-(--accent)/25 bg-[#050508] p-3">
                                <p className="text-[10px] font-bold uppercase tracking-wide text-(--accent)">
                                    Submitted receipt
                                </p>
                                {!order.receiptProofUrl?.trim() ? (
                                    <p className="mt-2 text-sm text-(--muted)">
                                        No receipt file is stored on this order. Ask the buyer to
                                        resend proof if they paid online.
                                    </p>
                                ) : receiptLoading ? (
                                    <div
                                        className="mt-3 flex min-h-[220px] items-center justify-center rounded-md border border-dashed border-white/15 bg-black/40 text-sm text-(--muted)"
                                        aria-busy="true"
                                    >
                                        Loading receipt…
                                    </div>
                                ) : receiptReadError ? (
                                    <p className="mt-2 text-sm text-amber-300/90">
                                        {receiptReadError}
                                    </p>
                                ) : receiptReadUrl ? (
                                    <div className="mt-3 space-y-3">
                                        <a
                                            href={receiptReadUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex text-xs font-bold uppercase tracking-wide text-(--accent) underline-offset-4 hover:underline"
                                        >
                                            Open receipt in new tab
                                        </a>
                                        {showReceiptFull ? (
                                            <div className="overflow-hidden rounded-md border border-white/10 bg-black/50">
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img
                                                    src={receiptReadUrl}
                                                    alt="Buyer payment receipt"
                                                    className="max-h-[min(420px,70vh)] w-full object-contain object-top"
                                                    onError={() => setShowReceiptFull(false)}
                                                />
                                            </div>
                                        ) : (
                                            <p className="text-xs text-(--muted)">
                                                Preview not shown (e.g. PDF). Use{" "}
                                                <span className="text-(--accent)">
                                                    Open receipt in new tab
                                                </span>
                                                .
                                            </p>
                                        )}
                                    </div>
                                ) : null}
                            </div>

                            <p className="mt-4 text-xs text-(--muted)">
                                Verification status:{" "}
                                <span className="font-medium text-foreground">
                                    {formatSellerEnumLabel(order.receiptStatus)}
                                </span>
                            </p>
                            {receiptResendLocked ? (
                                <p className="mt-2 text-xs text-(--muted)">
                                    {order.paymentStatus === "paid"
                                        ? "Payment is confirmed — you cannot ask the buyer to resend proof."
                                        : "This receipt is approved — resend requests are not available."}
                                </p>
                            ) : null}
                            <div className="mt-3 flex flex-col gap-3">
                                <input
                                    className={cn(inputDark, "w-full")}
                                    value={receiptNote}
                                    onChange={(e) => setReceiptNote(e.target.value)}
                                    placeholder="Note to buyer if they should resend proof (at least 5 characters)…"
                                    maxLength={500}
                                    disabled={receiptResendLocked || paymentProofBusy}
                                />
                                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                                    {order.paymentStatus !== "paid" ? (
                                        <button
                                            type="button"
                                            disabled={paymentProofBusy}
                                            onClick={() => void handlePaid()}
                                            className="h-10 shrink-0 bg-(--accent) px-4 text-xs font-bold uppercase tracking-wide text-[#030608] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                                        >
                                            Confirm payment
                                        </button>
                                    ) : null}
                                    <button
                                        type="button"
                                        disabled={
                                            receiptResendLocked ||
                                            receiptNote.trim().length < 5 ||
                                            paymentProofBusy
                                        }
                                        onClick={() => void handleReceiptRequest()}
                                        className="h-10 shrink-0 border border-white/15 px-4 text-xs font-bold uppercase tracking-wide hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                        Ask to resend proof
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : null}

                    {lineItems.length > 1 ? (
                        <div className="border border-white/10 bg-[#0e131c] p-4">
                            <p className="text-[10px] font-semibold uppercase text-(--muted)">
                                All line items
                            </p>
                            <ul className="mt-2 space-y-3 text-sm">
                                {lineItems.map((li) => {
                                    const p = productMap[li.productId];
                                    const spec = formatCartSelectionsLine(p, li.selections);
                                    return (
                                        <li
                                            key={li.id}
                                            className="border-b border-white/5 pb-3 last:border-0 last:pb-0 text-(--muted)"
                                        >
                                            <span className="text-foreground">
                                                {p?.title ?? li.productId} × {li.quantity}
                                            </span>
                                            {spec ? (
                                                <p className="mt-1 text-xs leading-relaxed">
                                                    {spec}
                                                </p>
                                            ) : null}
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    ) : null}
                </div>

                <aside className="space-y-6">
                    <div className="border border-white/10 bg-[#0e131c] p-5">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-(--accent)">
                            Customer
                        </p>
                        <p className="mt-3 text-lg font-semibold text-foreground">
                            {buyerDisplayName}
                        </p>
                        <p className="mt-1 text-xs text-(--muted)">
                            Buyer account on {order.buyerId}
                        </p>
                        <p className="mt-3 text-xs text-(--muted)">
                            Payment: {formatSellerEnumLabel(order.paymentMethod)} ·{" "}
                            <span
                                className={
                                    order.paymentStatus === "paid"
                                        ? "text-emerald-400"
                                        : "text-amber-300"
                                }
                            >
                                {formatSellerEnumLabel(order.paymentStatus)}
                            </span>
                        </p>
                        {order.paymentMethod === "online" && order.receiptProofUrl ? (
                            <div className="mt-4 border-t border-white/10 pt-4">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-(--muted)">
                                    Buyer payment receipt
                                </p>
                                {receiptReadError ? (
                                    <p className="mt-2 text-xs text-amber-300/90">
                                        {receiptReadError}
                                    </p>
                                ) : !receiptReadUrl ? (
                                    <p className="mt-2 text-xs text-(--muted)">Loading receipt…</p>
                                ) : (
                                    <>
                                        <a
                                            href={receiptReadUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="mt-2 inline-block text-xs font-semibold text-(--accent) underline-offset-4 hover:underline"
                                        >
                                            Open in new tab
                                        </a>
                                        {showReceiptThumb ? (
                                            <div className="mt-2 overflow-hidden rounded-md border border-white/10 bg-black/30">
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img
                                                    src={receiptReadUrl}
                                                    alt="Buyer payment receipt"
                                                    className="max-h-32 w-full object-contain object-top"
                                                    onError={() => setShowReceiptThumb(false)}
                                                />
                                            </div>
                                        ) : (
                                            <p className="mt-2 text-[11px] text-(--muted)">
                                                Thumbnail preview unavailable — use the link above.
                                            </p>
                                        )}
                                    </>
                                )}
                            </div>
                        ) : order.paymentMethod === "online" && !order.receiptProofUrl ? (
                            <p className="mt-3 text-xs text-(--muted)">
                                No receipt file on record for this order.
                            </p>
                        ) : null}
                    </div>

                    <div className="border border-white/10 bg-[#0e131c] p-5">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-(--accent)">
                            Messages
                        </p>
                        <p className="mt-1 text-xs text-(--muted)">
                            Same thread the buyer sees on their order.
                        </p>
                        <div className="mt-4 max-h-64 space-y-2 overflow-y-auto rounded-lg border border-white/10 bg-[#080b10] p-3">
                            {messages.map((message) => {
                                const mine =
                                    Boolean(sellerUserId) && message.senderId === sellerUserId;
                                return (
                                    <div
                                        key={message.id}
                                        className={cn(
                                            "rounded-lg border px-3 py-2 text-xs",
                                            mine
                                                ? "ml-2 border-(--accent)/30 bg-(--accent)/10"
                                                : "mr-2 border-white/10 bg-black/30"
                                        )}
                                    >
                                        <p className="text-[10px] font-semibold uppercase text-(--accent)">
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
                                <p className="py-4 text-center text-sm text-(--muted)">
                                    No messages yet.
                                </p>
                            ) : null}
                        </div>
                        <div className="mt-3 flex gap-2">
                            <input
                                className={cn(inputDark, "flex-1")}
                                value={messageInput}
                                onChange={(e) => setMessageInput(e.target.value)}
                                placeholder="Message your customer…"
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
                                className="h-10 shrink-0 bg-(--accent) px-5 text-xs font-bold uppercase text-[#030608] hover:brightness-110"
                            >
                                Send
                            </button>
                        </div>
                    </div>
                </aside>
            </div>

            <p className="mt-10 text-[10px] text-(--muted)">
                Last loaded: {new Date().toISOString().slice(0, 19)} UTC · {order.id}
            </p>

            {cancelModalOpen ? (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="cancel-order-title"
                >
                    <div className="w-full max-w-md border border-white/15 bg-[#0e131c] p-6 shadow-[0_0_48px_rgba(0,0,0,0.5)]">
                        <h2
                            id="cancel-order-title"
                            className="text-lg font-bold tracking-tight text-foreground"
                        >
                            Cancel or decline this order?
                        </h2>
                        <p className="mt-2 text-sm text-(--muted)">
                            The buyer will see this reason in the order messages and their order
                            history. Minimum 10 characters.
                        </p>
                        <textarea
                            className={cn(inputDark, "mt-4 min-h-[120px] resize-y py-2")}
                            value={cancelReason}
                            onChange={(e) => setCancelReason(e.target.value)}
                            placeholder="Explain why you cannot fulfill this order (e.g. out of stock, cannot ship to their area)…"
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
                                disabled={cancelSubmitting || cancelReason.trim().length < 10}
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
    );
}
