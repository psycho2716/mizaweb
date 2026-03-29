"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Check, Package, Truck } from "lucide-react";
import { getOrderById, getProductDetail } from "@/lib/api/endpoints";
import { readCheckoutSuccessMeta } from "@/lib/checkout-success-storage";
import { formatPeso, getAppName } from "@/lib/utils";
import type { OrderLineItem } from "@/types";
import type { ProductDetail } from "@/types";

export function BuyerOrderSuccessClient() {
    const searchParams = useSearchParams();
    const orderId = searchParams.get("orderId")?.trim() ?? "";
    const appName = getAppName();

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lineItems, setLineItems] = useState<OrderLineItem[]>([]);
    const [totalAmount, setTotalAmount] = useState(0);
    const [productMap, setProductMap] = useState<Record<string, ProductDetail>>({});

    const meta = orderId ? readCheckoutSuccessMeta(orderId) : null;

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
                setLineItems(res.data.lineItems);
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
            <main className="mx-auto max-w-lg flex-1 px-4 py-20 text-center">
                <p className="text-sm text-(--muted)">{error ?? "No order selected."}</p>
                <Link
                    href="/buyer/orders"
                    className="mt-6 inline-flex h-11 items-center justify-center bg-(--accent) px-6 text-sm font-semibold text-[#030608] transition hover:brightness-110"
                >
                    View my orders
                </Link>
            </main>
        );
    }

    return (
        <main className="relative min-h-screen flex-1 overflow-hidden bg-[#050508] text-foreground">
            <div
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_45%_at_30%_0%,rgba(34,199,243,0.08),transparent)]"
                aria-hidden
            />
            <div className="relative z-10 mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
                {loading ? (
                    <p className="text-sm text-(--muted)">Loading your confirmation…</p>
                ) : (
                    <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(300px,400px)] lg:items-start lg:gap-16">
                        <section className="space-y-8">
                            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-(--accent) text-[#030608] shadow-[0_0_48px_-8px_rgba(34,199,243,0.55)]">
                                <Check className="h-10 w-10 stroke-[2.5]" aria-hidden />
                            </div>
                            <div>
                                <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
                                    Order confirmed
                                </h1>
                                <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-(--muted)">
                                    Order number
                                </p>
                                <p className="mt-1 font-mono text-sm text-foreground">{orderId}</p>
                            </div>

                            <div className="space-y-6 border-t border-white/10 pt-8">
                                <div>
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--muted)">
                                        Shipping
                                    </p>
                                    <div className="mt-3 flex items-start gap-3">
                                        <Truck
                                            className="mt-0.5 h-5 w-5 shrink-0 text-(--accent)"
                                            aria-hidden
                                        />
                                        <div>
                                            <p className="font-medium text-foreground">
                                                Delivery with seller
                                            </p>
                                            <p className="mt-1 text-sm text-(--muted)">
                                                The seller may message you to confirm timing, fees, and
                                                handoff details.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                                {meta?.estimatedDeliveryRange ? (
                                    <div>
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--muted)">
                                            Estimated delivery window
                                        </p>
                                        <p className="mt-2 text-xl font-semibold tracking-tight text-foreground">
                                            {meta.estimatedDeliveryRange}
                                        </p>
                                        <p className="mt-1 text-xs text-(--muted)">
                                            This is an estimate only—your seller will confirm what’s
                                            possible.
                                        </p>
                                    </div>
                                ) : null}
                            </div>

                            <div className="flex flex-wrap gap-3 pt-4">
                                <Link
                                    href="/buyer/orders"
                                    className="inline-flex h-12 items-center justify-center bg-(--accent) px-8 text-xs font-bold uppercase tracking-[0.14em] text-[#030608] transition hover:brightness-110"
                                >
                                    View order details
                                    <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
                                </Link>
                                <Link
                                    href="/products"
                                    className="inline-flex h-12 items-center justify-center border border-white/25 bg-transparent px-8 text-xs font-bold uppercase tracking-[0.14em] text-foreground transition hover:bg-white/5"
                                >
                                    Keep shopping
                                </Link>
                            </div>
                        </section>

                        <aside className="rounded-xl border border-white/10 bg-[#0c1018] p-6 shadow-[0_0_50px_-20px_rgba(34,199,243,0.3)] lg:sticky lg:top-28">
                            <div className="flex items-center gap-2">
                                <Package className="h-5 w-5 text-(--accent)" aria-hidden />
                                <h2 className="text-lg font-bold tracking-tight">Your items</h2>
                            </div>
                            <ul className="mt-6 space-y-4">
                                {lineItems.map((li) => {
                                    const p = productMap[li.productId];
                                    const thumb =
                                        p?.thumbnailUrl?.trim() || p?.media[0]?.url || null;
                                    const title = p?.title ?? li.productId;
                                    const line = (p?.basePrice ?? 0) * li.quantity;
                                    return (
                                        <li
                                            key={li.id}
                                            className="flex gap-3 border-b border-white/5 pb-4 last:border-0 last:pb-0"
                                        >
                                            <div className="h-14 w-14 shrink-0 overflow-hidden bg-[#12161f]">
                                                {thumb ? (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img
                                                        src={thumb}
                                                        alt=""
                                                        className="h-full w-full object-cover"
                                                    />
                                                ) : null}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-semibold leading-snug">
                                                    {title}
                                                </p>
                                                <p className="mt-1 text-xs text-(--muted)">
                                                    Qty {li.quantity}
                                                </p>
                                                <p className="mt-1 text-sm font-semibold text-(--accent)">
                                                    {formatPeso(line)}
                                                </p>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                            <div className="mt-6 space-y-2 border-t border-white/10 pt-6 text-sm">
                                <div className="flex justify-between text-(--muted)">
                                    <span>Subtotal (items)</span>
                                    <span className="tabular-nums text-foreground">
                                        {formatPeso(
                                            lineItems.reduce(
                                                (s, li) =>
                                                    s +
                                                    (productMap[li.productId]?.basePrice ?? 0) *
                                                        li.quantity,
                                                0
                                            )
                                        )}
                                    </span>
                                </div>
                                <div className="flex justify-between text-(--muted)">
                                    <span>Delivery</span>
                                    <span className="text-right text-foreground">
                                        With seller
                                    </span>
                                </div>
                                <div className="flex justify-between border-t border-white/10 pt-3 text-lg font-bold">
                                    <span>Total</span>
                                    <span className="tabular-nums text-(--accent)">
                                        {formatPeso(totalAmount)}
                                    </span>
                                </div>
                            </div>
                            {meta ? (
                                <div className="mt-6 border-l-2 border-(--accent) bg-black/25 px-4 py-3 text-xs leading-relaxed text-(--muted)">
                                    <p className="font-semibold text-foreground">Ship to</p>
                                    <p className="mt-1">
                                        {meta.fullName} · {meta.email}
                                    </p>
                                    <p className="mt-1">
                                        {meta.addressLine}, {meta.city} {meta.postalCode},{" "}
                                        {meta.country}
                                    </p>
                                </div>
                            ) : null}
                            <p className="mt-6 text-[10px] uppercase tracking-[0.16em] text-(--muted)">
                                Thank you for shopping on {appName}
                            </p>
                        </aside>
                    </div>
                )}
            </div>
        </main>
    );
}
