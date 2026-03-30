"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
    ArrowRight,
    Check,
    Globe,
    Layers2,
    Shield,
    Truck
} from "lucide-react";
import { toast } from "sonner";
import { getOrderById, getProductDetail } from "@/lib/api/endpoints";
import { readCheckoutSuccessMeta } from "@/lib/checkout-success-storage";
import { openOrderReceiptPrintWindow } from "@/lib/order-receipt-print";
import { normalizeCartItemSelections } from "@/lib/normalize-cart-item-selections";
import { formatPeso, getAppName } from "@/lib/utils";
import type {
    CartItemSelection,
    CheckoutSuccessDisplayMeta,
    Order,
    OrderLineItem,
    OrderReceiptPrintPayload,
    OrderReceiptShipTo,
    ProductDetail
} from "@/types";

const DELIVERY_DATE_OPTS: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric"
};

function estimatedDeliveryLabelFromOrder(order: Order | null): string | null {
    const display = order?.estimatedDeliveryRangeDisplay?.trim();
    if (display) {
        return display;
    }
    const startAt = order?.estimatedDeliveryStartAt;
    const endAt = order?.estimatedDeliveryEndAt;
    if (startAt && endAt) {
        const a = new Date(startAt);
        const b = new Date(endAt);
        if (Number.isFinite(a.getTime()) && Number.isFinite(b.getTime())) {
            return `${a.toLocaleDateString(undefined, DELIVERY_DATE_OPTS)} – ${b.toLocaleDateString(undefined, DELIVERY_DATE_OPTS)}`;
        }
    }
    return null;
}

/** Full spec lines for print receipt (sentence case). */
function selectionLinesForReceipt(
    product: ProductDetail | undefined,
    selections: CartItemSelection[] | undefined
): string[] {
    if (!selections?.length) {
        return [];
    }
    const byId = new Map((product?.options ?? []).map((o) => [o.id, o]));
    const out: string[] = [];
    for (const s of selections) {
        const o = byId.get(s.optionId);
        const name = s.optionLabel?.trim() || o?.name;
        if (name) {
            out.push(`${name}: ${s.value}`);
        } else if (s.value) {
            out.push(s.value);
        }
    }
    return out;
}

function selectionTags(
    product: ProductDetail | undefined,
    selections: CartItemSelection[] | undefined
): string[] {
    return selectionLinesForReceipt(product, selections)
        .slice(0, 2)
        .map((line) => line.toUpperCase());
}

function orderStatusLabelForReceipt(status: Order["status"]): string {
    switch (status) {
        case "created":
            return "Placed — awaiting seller confirmation";
        case "confirmed":
            return "Confirmed by seller";
        case "processing":
            return "Being prepared";
        case "shipped":
            return "Shipped / on the way";
        case "delivered":
            return "Delivered";
        case "cancelled":
            return "Cancelled";
        default:
            return status;
    }
}

function paymentMethodLabelForReceipt(order: Order): string {
    if (order.paymentMethod === "cash") {
        return "Cash (coordinate payment and meet-up with your seller)";
    }
    const ref = order.paymentReference?.trim();
    return ref ? `Online payment · ${ref}` : "Online payment";
}

function paymentStatusLabelForReceipt(order: Order): string {
    return order.paymentStatus === "paid" ? "Paid" : "Pending";
}

function buildReceiptShipTo(meta: CheckoutSuccessDisplayMeta | null, order: Order): OrderReceiptShipTo | null {
    if (meta) {
        return {
            fullName: meta.fullName,
            email: meta.email,
            ...(meta.contactNumber ? { contactNumber: meta.contactNumber } : {}),
            addressLine: meta.addressLine,
            city: meta.city,
            postalCode: meta.postalCode,
            ...(meta.country ? { country: meta.country } : {}),
            ...(meta.deliveryNotes?.trim() ? { deliveryNotes: meta.deliveryNotes.trim() } : {})
        };
    }
    const name = order.shippingRecipientName?.trim();
    const addr = order.shippingAddressLine?.trim();
    if (!name && !addr) {
        return null;
    }
    return {
        fullName: name || "—",
        email: "",
        ...(order.shippingContactNumber?.trim()
            ? { contactNumber: order.shippingContactNumber.trim() }
            : {}),
        addressLine: addr || "—",
        city: order.shippingCity?.trim() || "—",
        postalCode: order.shippingPostalCode?.trim() || "—",
        ...(order.deliveryNotes?.trim() ? { deliveryNotes: order.deliveryNotes.trim() } : {})
    };
}

function OrderSuccessFooter() {
    const appName = getAppName();
    const year = new Date().getFullYear();
    return (
        <footer className="border-t border-white/[0.07] bg-[#030406]">
            <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
                <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
                    <div className="space-y-3">
                        <p className="text-xs font-bold uppercase tracking-[0.2em] text-foreground">
                            {appName}
                        </p>
                        <p className="max-w-xs text-sm leading-relaxed text-(--muted)">
                            Hand-finished stone pieces from verified local sellers—shop, message, and
                            check out in one place.
                        </p>
                    </div>
                    <div className="space-y-3">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--muted)">
                            Help
                        </p>
                        <ul className="space-y-2 text-sm">
                            <li>
                                <a
                                    href="mailto:support@mizaweb.app"
                                    className="text-foreground/90 transition-colors hover:text-(--accent)"
                                >
                                    Contact us
                                </a>
                            </li>
                            <li>
                                <Link
                                    href="/buyer/orders"
                                    className="text-foreground/90 transition-colors hover:text-(--accent)"
                                >
                                    Your orders
                                </Link>
                            </li>
                        </ul>
                    </div>
                    <div className="space-y-3">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--muted)">
                            Policies
                        </p>
                        <ul className="space-y-2 text-sm">
                            <li>
                                <span className="text-foreground/90">Product quality</span>
                                <p className="mt-0.5 text-xs text-(--muted)">
                                    Sellers are verified; report issues from your order page.
                                </p>
                            </li>
                            <li>
                                <Link
                                    href="/products"
                                    className="text-foreground/90 transition-colors hover:text-(--accent)"
                                >
                                    Fair buying
                                </Link>
                            </li>
                        </ul>
                    </div>
                    <div className="flex flex-col justify-between gap-4 sm:col-span-2 lg:col-span-1">
                        <p className="text-xs text-(--muted)">
                            © {year} {appName}. All rights reserved.
                        </p>
                        <div className="flex gap-3 text-(--muted)">
                            <Globe className="h-4 w-4 shrink-0" aria-hidden />
                            <Shield className="h-4 w-4 shrink-0" aria-hidden />
                        </div>
                    </div>
                </div>
            </div>
        </footer>
    );
}

export function BuyerOrderSuccessClient() {
    const searchParams = useSearchParams();
    const orderId = searchParams.get("orderId")?.trim() ?? "";
    const appName = getAppName();

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [order, setOrder] = useState<Order | null>(null);
    const [lineItems, setLineItems] = useState<OrderLineItem[]>([]);
    const [totalAmount, setTotalAmount] = useState(0);
    const [productMap, setProductMap] = useState<Record<string, ProductDetail>>({});

    const meta = orderId ? readCheckoutSuccessMeta(orderId) : null;
    const estimatedDeliveryLabel =
        estimatedDeliveryLabelFromOrder(order) ?? meta?.estimatedDeliveryRange ?? null;

    const itemsSubtotal = useMemo(
        () =>
            lineItems.reduce(
                (s, li) => s + (productMap[li.productId]?.basePrice ?? 0) * li.quantity,
                0
            ),
        [lineItems, productMap]
    );

    const deliveryPortion = useMemo(
        () => Math.max(0, totalAmount - itemsSubtotal),
        [totalAmount, itemsSubtotal]
    );

    const shippingReceiptDisplay = useMemo(
        () => (deliveryPortion > 0 ? formatPeso(deliveryPortion) : "With seller"),
        [deliveryPortion]
    );

    const handleSaveOrPrintReceipt = useCallback(() => {
        if (!order) {
            return;
        }
        const lines = lineItems.map((li) => {
            const p = productMap[li.productId];
            const unit = p?.basePrice ?? 0;
            return {
                title: p?.title ?? li.productId,
                quantity: li.quantity,
                unitPricePeso: unit,
                lineTotalPeso: unit * li.quantity,
                optionLines: selectionLinesForReceipt(p, li.selections)
            };
        });
        const payload: OrderReceiptPrintPayload = {
            appName,
            orderId,
            orderPlacedAtIso: order.createdAt,
            paymentMethodLabel: paymentMethodLabelForReceipt(order),
            paymentStatusLabel: paymentStatusLabelForReceipt(order),
            orderStatusLabel: orderStatusLabelForReceipt(order.status),
            estimatedDelivery: estimatedDeliveryLabel,
            lines,
            subtotalPeso: itemsSubtotal,
            shippingDisplay: shippingReceiptDisplay,
            totalPeso: totalAmount,
            shipTo: buildReceiptShipTo(meta, order),
            footerNote: `Thank you for supporting local stone artisans. Thoughtful buying keeps craft skills alive and helps sellers on ${appName} thrive.`
        };
        const opened = openOrderReceiptPrintWindow(payload);
        if (!opened) {
            toast.error("Allow pop-ups for this site to open your receipt, then use Print → Save as PDF.");
        }
    }, [
        appName,
        orderId,
        order,
        lineItems,
        productMap,
        estimatedDeliveryLabel,
        itemsSubtotal,
        shippingReceiptDisplay,
        totalAmount,
        meta
    ]);

    useEffect(() => {
        if (!orderId) {
            setLoading(false);
            setError("Missing order.");
            return;
        }
        let cancelled = false;
        void (async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await getOrderById(orderId);
                if (cancelled) {
                    return;
                }
                setOrder(res.data.order);
                setLineItems(
                    res.data.lineItems.map((li) => ({
                        ...li,
                        selections: normalizeCartItemSelections(li.selections)
                    }))
                );
                setTotalAmount(res.data.order.totalAmount);
                const map: Record<string, ProductDetail> = {};
                await Promise.all(
                    res.data.lineItems.map(async (li) => {
                        try {
                            const r = await getProductDetail(li.productId);
                            map[li.productId] = r.data;
                        } catch {
                            /* ignore */
                        }
                    })
                );
                if (!cancelled) {
                    setProductMap(map);
                }
            } catch {
                if (!cancelled) {
                    setError("We could not load this order.");
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [orderId]);

    if (!orderId || error) {
        return (
            <main className="mx-auto flex min-h-[60vh] max-w-lg flex-1 flex-col justify-center px-4 py-20 text-center">
                <p className="text-sm text-(--muted)">{error ?? "No order selected."}</p>
                <Link
                    href="/buyer/orders"
                    className="mt-6 inline-flex h-11 items-center justify-center bg-(--accent) px-6 text-sm font-semibold text-[#030608] transition hover:brightness-110"
                >
                    View your orders
                </Link>
            </main>
        );
    }

    return (
        <main className="relative flex min-h-screen flex-1 flex-col overflow-hidden bg-[#050508] text-foreground">
            <div
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_55%_40%_at_25%_-5%,rgba(34,199,243,0.11),transparent_55%)]"
                aria-hidden
            />

            <div className="relative z-10 flex flex-1 flex-col">
                <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
                    {loading ? (
                        <div className="grid animate-pulse gap-10 lg:grid-cols-[1fr_minmax(280px,380px)] lg:gap-14">
                            <div className="space-y-6">
                                <div className="h-20 w-20 rounded-full bg-white/10" />
                                <div className="h-12 max-w-md rounded bg-white/10" />
                                <div className="h-24 max-w-sm rounded bg-white/5" />
                            </div>
                            <div className="h-[420px] rounded-lg bg-white/5 lg:h-auto" />
                        </div>
                    ) : (
                        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,400px)] lg:items-start lg:gap-16">
                            <section className="space-y-10 lg:pr-4">
                                <div className="flex h-18 w-18 items-center justify-center rounded-full bg-(--accent) text-[#030608] shadow-[0_0_56px_-6px_rgba(34,199,243,0.5)]">
                                    <Check className="h-11 w-11 stroke-[2.5]" aria-hidden />
                                </div>

                                <div>
                                    <h1 className="text-[2rem] font-bold leading-[1.1] tracking-tight sm:text-5xl sm:leading-[1.08]">
                                        Your order is placed
                                    </h1>
                                    <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.26em] text-(--muted)">
                                        Order number
                                    </p>
                                    <p className="mt-1.5 break-all font-mono text-sm text-foreground/95">
                                        {orderId}
                                    </p>
                                </div>

                                <div className="space-y-8 border-t border-white/10 pt-10">
                                    <div>
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-(--muted)">
                                            Shipping method
                                        </p>
                                        <div className="mt-4 flex items-start gap-3.5">
                                            <Truck
                                                className="mt-0.5 h-6 w-6 shrink-0 text-(--accent)"
                                                aria-hidden
                                            />
                                            <div>
                                                <p className="text-lg font-semibold tracking-tight text-foreground">
                                                    Delivery arranged with your seller
                                                </p>
                                                <p className="mt-2 text-sm leading-relaxed text-(--muted)">
                                                    They may message you to confirm timing, meeting
                                                    place, and any extra fees. Large or heavy items may
                                                    need special shipping—your seller will explain.
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {estimatedDeliveryLabel ? (
                                        <div>
                                            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-(--muted)">
                                                Estimated delivery date
                                            </p>
                                            <p className="mt-3 text-2xl font-semibold tracking-tight text-foreground sm:text-[1.65rem]">
                                                {estimatedDeliveryLabel}
                                            </p>
                                            <p className="mt-2 text-xs leading-relaxed text-(--muted)">
                                                Dates are estimates only. Your seller will confirm what
                                                works.
                                            </p>
                                        </div>
                                    ) : null}
                                </div>

                                <div className="flex flex-wrap gap-3 pt-2">
                                    <Link
                                        href="/buyer/orders"
                                        className="inline-flex h-12 min-w-[200px] items-center justify-center bg-(--accent) px-8 text-xs font-bold uppercase tracking-[0.14em] text-[#030608] transition hover:brightness-110"
                                    >
                                        View order details
                                        <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
                                    </Link>
                                    <button
                                        type="button"
                                        onClick={() => handleSaveOrPrintReceipt()}
                                        className="inline-flex h-12 items-center justify-center border border-white/20 bg-transparent px-8 text-xs font-bold uppercase tracking-[0.14em] text-foreground transition hover:bg-white/5"
                                    >
                                        Save or print receipt
                                    </button>
                                </div>
                            </section>

                            <aside className="rounded-none border border-white/10 bg-[#0e131c] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_0_60px_-24px_rgba(34,199,243,0.25)] sm:rounded-lg lg:sticky lg:top-24 lg:p-7">
                                <div className="flex items-center gap-2.5 border-b border-white/5 pb-5">
                                    <Layers2 className="h-5 w-5 text-(--accent)" aria-hidden />
                                    <h2 className="text-base font-bold tracking-tight text-foreground">
                                        Your items
                                    </h2>
                                </div>

                                <ul className="mt-6 space-y-5">
                                    {lineItems.map((li) => {
                                        const p = productMap[li.productId];
                                        const thumb =
                                            p?.thumbnailUrl?.trim() || p?.media[0]?.url || null;
                                        const title = p?.title ?? li.productId;
                                        const line = (p?.basePrice ?? 0) * li.quantity;
                                        const tags = selectionTags(p, li.selections);
                                        return (
                                            <li
                                                key={li.id}
                                                className="flex gap-4 border-b border-white/6 pb-5 last:border-0 last:pb-0"
                                            >
                                                <div className="h-18 w-18 shrink-0 overflow-hidden bg-[#12161f]">
                                                    {thumb ? (
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img
                                                            src={thumb}
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
                                                    <p className="text-sm font-semibold leading-snug text-foreground">
                                                        {title}
                                                    </p>
                                                    {tags.length > 0 ? (
                                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                                            {tags.map((t) => (
                                                                <span
                                                                    key={t}
                                                                    className="inline-block bg-white/6 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide text-(--muted)"
                                                                >
                                                                    {t}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    ) : null}
                                                    <p className="mt-2 text-[10px] uppercase tracking-wide text-(--muted)">
                                                        Qty {li.quantity}
                                                    </p>
                                                    <p className="mt-2 text-base font-bold tabular-nums text-(--accent)">
                                                        {formatPeso(line)}
                                                    </p>
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>

                                <div className="mt-8 space-y-3 border-t border-white/10 pt-6 text-sm">
                                    <div className="flex justify-between gap-4 text-(--muted)">
                                        <span className="uppercase tracking-wide">Subtotal</span>
                                        <span className="tabular-nums text-foreground">
                                            {formatPeso(itemsSubtotal)}
                                        </span>
                                    </div>
                                    <div className="flex justify-between gap-4 text-(--muted)">
                                        <span className="uppercase tracking-wide">
                                            Shipping and fees
                                        </span>
                                        <span className="text-right tabular-nums text-foreground">
                                            {deliveryPortion > 0
                                                ? formatPeso(deliveryPortion)
                                                : "With seller"}
                                        </span>
                                    </div>
                                    <div className="flex justify-between gap-4 border-t border-white/10 pt-4">
                                        <span className="text-base font-bold text-foreground">
                                            Total price
                                        </span>
                                        <span className="text-xl font-bold tabular-nums text-(--accent)">
                                            {formatPeso(totalAmount)}
                                        </span>
                                    </div>
                                </div>

                                <div className="mt-6 border-l-[3px] border-(--accent) bg-black/30 px-4 py-4">
                                    <p className="text-xs italic leading-relaxed text-(--muted)">
                                        Thank you for supporting local stone artisans. Thoughtful
                                        buying keeps craft skills alive and helps sellers on {appName}{" "}
                                        thrive.
                                    </p>
                                </div>

                                {meta ? (
                                    <div className="mt-6 border border-white/10 bg-black/20 px-4 py-3 text-xs leading-relaxed text-(--muted)">
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-(--muted)">
                                            Send to
                                        </p>
                                        <p className="mt-2 font-medium text-foreground">
                                            {meta.fullName}
                                        </p>
                                        <p className="mt-0.5">{meta.email}</p>
                                        {meta.contactNumber ? (
                                            <p className="mt-1 tabular-nums">{meta.contactNumber}</p>
                                        ) : null}
                                        <p className="mt-2">
                                            {meta.addressLine}, {meta.city} {meta.postalCode}
                                            {meta.country ? `, ${meta.country}` : ""}
                                        </p>
                                        {meta.deliveryNotes?.trim() ? (
                                            <p className="mt-3 whitespace-pre-wrap border-t border-white/10 pt-3 text-(--muted)">
                                                <span className="font-semibold text-foreground">
                                                    Your note to the seller:{" "}
                                                </span>
                                                {meta.deliveryNotes.trim()}
                                            </p>
                                        ) : null}
                                    </div>
                                ) : null}
                            </aside>
                        </div>
                    )}
                </div>

                <OrderSuccessFooter />
            </div>
        </main>
    );
}
