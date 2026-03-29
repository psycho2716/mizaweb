"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CreditCard, Lock, Minus, Package, Plus, Shield, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
    getCart,
    getProductDetail,
    removeCartItem,
    updateCartItemQuantity
} from "@/lib/api/endpoints";
import { useMizaStoredUser } from "@/hooks/use-miza-stored-user";
import { formatCartSelectionsLine } from "@/lib/format-cart-selections";
import { cn, formatPeso, getAppName } from "@/lib/utils";
import type { CartItemResponse, ProductDetail } from "@/types";

function maxQtyForProduct(p: ProductDetail | undefined): number {
    if (!p) return 99;
    if (p.madeToOrder) return 99;
    return Math.max(1, p.stockQuantity ?? 1);
}

export function CartRegistryClient() {
    const appName = getAppName();
    const { user } = useMizaStoredUser();
    const [items, setItems] = useState<CartItemResponse[]>([]);
    const [productMap, setProductMap] = useState<Record<string, ProductDetail>>({});
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);

    const checkoutHref = useMemo(() => {
        if (user?.role === "buyer") {
            return "/buyer/checkout";
        }
        const q = encodeURIComponent("/buyer/checkout");
        return `/auth/login?callbackUrl=${q}`;
    }, [user]);

    const refreshCart = useCallback(async () => {
        setLoadError(null);
        try {
            const { data } = await getCart();
            setItems(data);
            const next: Record<string, ProductDetail> = {};
            await Promise.all(
                data.map(async (row) => {
                    try {
                        const r = await getProductDetail(row.productId);
                        next[row.productId] = r.data;
                    } catch {
                        /* listing removed */
                    }
                })
            );
            setProductMap(next);
        } catch (err) {
            setItems([]);
            setProductMap({});
            setLoadError(err instanceof Error ? err.message : "Could not load your cart.");
        }
    }, []);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            setLoading(true);
            await refreshCart();
            if (!cancelled) {
                setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [refreshCart]);

    useEffect(() => {
        const onAuthChange = () => {
            void refreshCart();
        };
        window.addEventListener("miza-auth-change", onAuthChange);
        return () => window.removeEventListener("miza-auth-change", onAuthChange);
    }, [refreshCart]);

    const subtotal = useMemo(() => {
        return items.reduce((sum, row) => {
            const p = productMap[row.productId];
            const unit = p?.basePrice ?? 0;
            return sum + unit * row.quantity;
        }, 0);
    }, [items, productMap]);

    async function setQuantity(row: CartItemResponse, next: number) {
        const p = productMap[row.productId];
        const max = maxQtyForProduct(p);
        const clamped = Math.min(max, Math.max(1, Math.floor(next)));
        if (clamped === row.quantity) {
            return;
        }
        setBusyId(row.id);
        try {
            const { data } = await updateCartItemQuantity(row.id, clamped);
            setItems((prev) => prev.map((r) => (r.id === row.id ? data : r)));
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not update quantity.");
            await refreshCart();
        } finally {
            setBusyId(null);
        }
    }

    async function removeRow(row: CartItemResponse) {
        setBusyId(row.id);
        try {
            await removeCartItem(row.id);
            setItems((prev) => prev.filter((r) => r.id !== row.id));
            toast.success("Removed from registry");
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not remove item.");
        } finally {
            setBusyId(null);
        }
    }

    const empty = !loading && items.length === 0;

    return (
        <main className="relative min-h-screen flex-1 overflow-hidden bg-[#050508] text-foreground">
            <div
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_-20%,rgba(34,199,243,0.08),transparent)]"
                aria-hidden
            />
            <div className="relative z-10 mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-(--accent)">
                    {appName}
                </p>
                <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Cart Items</h1>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-(--muted)">
                    {user?.role === "buyer"
                        ? "Review your items, then continue to shipping and payment."
                        : "Review your cart. Sign in with a buyer account to complete checkout."}
                </p>

                {loadError ? (
                    <p
                        className="mt-6 rounded-lg border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm text-red-200"
                        role="alert"
                    >
                        {loadError}
                    </p>
                ) : null}

                {loading ? (
                    <p className="mt-10 text-sm text-(--muted)">Loading registry…</p>
                ) : empty ? (
                    <div className="mx-auto mt-12 max-w-md rounded-xl border border-(--border) bg-[#080b10] px-8 py-14 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                        <Package className="mx-auto h-12 w-12 text-(--accent)/50" aria-hidden />
                        <h2 className="mt-5 text-xl font-semibold tracking-tight">
                            Registry is empty
                        </h2>
                        <p className="mt-2 text-sm text-(--muted)">
                            Add listings from the shop, then return here.
                        </p>
                        <Link
                            href="/products"
                            className="mt-8 inline-flex h-11 items-center justify-center bg-(--accent) px-8 text-sm font-semibold text-[#030608] transition hover:brightness-110"
                        >
                            Browse products
                        </Link>
                    </div>
                ) : (
                    <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] lg:gap-12">
                        <div className="min-w-0 space-y-6">
                            <div className="hidden gap-6 border-b border-white/10 pb-3 md:grid md:grid-cols-[minmax(0,1fr)_140px_minmax(120px,1fr)]">
                                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--muted)">
                                    Product details
                                </span>
                                <span className="text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-(--muted)">
                                    Quantity
                                </span>
                                <span className="text-right text-[10px] font-semibold uppercase tracking-[0.2em] text-(--muted)">
                                    Item  total
                                </span>
                            </div>

                            <ul className="space-y-4">
                                {items.map((row) => {
                                    const p = productMap[row.productId];
                                    const thumb = p?.media[0]?.url ?? p?.thumbnailUrl ?? "";
                                    const unit = p?.basePrice ?? 0;
                                    const line = unit * row.quantity;
                                    const max = maxQtyForProduct(p);
                                    const specLine = formatCartSelectionsLine(p, row.selections);
                                    const disabled = busyId === row.id;

                                    return (
                                        <li
                                            key={row.id}
                                            className="rounded-xl border border-(--border) bg-[#080b10] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] md:grid md:grid-cols-[minmax(0,1fr)_140px_minmax(120px,1fr)] md:items-center md:gap-6"
                                        >
                                            <div className="flex gap-4">
                                                <Link
                                                    href={`/products/${row.productId}`}
                                                    className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-[#12161f]"
                                                >
                                                    {thumb ? (
                                                        // eslint-disable-next-line @next/next/no-img-element -- listing URLs from API (remote hosts)
                                                        <img
                                                            src={thumb}
                                                            alt=""
                                                            className="absolute inset-0 h-full w-full object-cover"
                                                        />
                                                    ) : (
                                                        <span className="flex h-full items-center justify-center text-[10px] text-(--muted)">
                                                            No image
                                                        </span>
                                                    )}
                                                    {p?.isFeatured ? (
                                                        <span className="absolute bottom-1 left-1 rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#030608] bg-(--accent)">
                                                            Featured
                                                        </span>
                                                    ) : null}
                                                </Link>
                                                <div className="min-w-0 flex-1">
                                                    <Link
                                                        href={`/products/${row.productId}`}
                                                        className="font-semibold text-foreground hover:text-(--accent)"
                                                    >
                                                        {p?.title ??
                                                            `Product ${row.productId.slice(0, 8)}…`}
                                                    </Link>
                                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                                        {p?.madeToOrder ? (
                                                            <span className="rounded border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-(--muted)">
                                                                Made to order
                                                            </span>
                                                        ) : (
                                                            <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-200/90">
                                                                In stock: {p?.stockQuantity ?? "—"}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {specLine ? (
                                                        <p className="mt-2 text-xs text-(--muted)">
                                                            {specLine}
                                                        </p>
                                                    ) : null}
                                                    <button
                                                        type="button"
                                                        onClick={() => removeRow(row)}
                                                        disabled={disabled}
                                                        className="mt-3 inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-(--muted) transition hover:text-red-300 disabled:opacity-50"
                                                    >
                                                        <Trash2
                                                            className="h-3.5 w-3.5"
                                                            aria-hidden
                                                        />
                                                        Remove from cart
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="mt-4 flex items-center justify-between gap-3 md:mt-0 md:flex-col md:justify-center">
                                                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--muted) md:hidden">
                                                    Quantity
                                                </span>
                                                <div className="flex items-center gap-0 rounded-lg border border-(--border) bg-[#12161f] p-0.5">
                                                    <button
                                                        type="button"
                                                        aria-label="Decrease quantity"
                                                        disabled={disabled || row.quantity <= 1}
                                                        onClick={() =>
                                                            setQuantity(row, row.quantity - 1)
                                                        }
                                                        className="flex h-9 w-9 items-center justify-center rounded-md text-(--muted) transition hover:bg-white/5 hover:text-foreground disabled:opacity-30"
                                                    >
                                                        <Minus className="h-4 w-4" />
                                                    </button>
                                                    <span className="min-w-9 text-center text-sm font-semibold tabular-nums">
                                                        {row.quantity}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        aria-label="Increase quantity"
                                                        disabled={disabled || row.quantity >= max}
                                                        onClick={() =>
                                                            setQuantity(row, row.quantity + 1)
                                                        }
                                                        className="flex h-9 w-9 items-center justify-center rounded-md text-(--muted) transition hover:bg-white/5 hover:text-foreground disabled:opacity-30"
                                                    >
                                                        <Plus className="h-4 w-4" />
                                                    </button>
                                                </div>
                                                <p className="text-[10px] text-(--muted) md:text-center">
                                                    Max {max}
                                                </p>
                                            </div>

                                            <div className="mt-4 text-right md:mt-0">
                                                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--muted) md:hidden">
                                                    Item Total
                                                </span>
                                                <p className="text-lg font-bold tabular-nums text-foreground md:mt-1">
                                                    {formatPeso(line)}
                                                </p>
                                                <p className="text-xs text-(--muted)">
                                                    {formatPeso(unit)} each
                                                </p>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>

                        <aside className="lg:pt-10">
                            <div className="rounded-xl border border-(--border) bg-[#080b10] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                                <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-foreground">
                                    Order summary
                                </h2>
                                <dl className="mt-6 space-y-3 text-sm">
                                    <div className="flex justify-between gap-4 text-(--muted)">
                                        <dt>Subtotal</dt>
                                        <dd className="tabular-nums text-foreground">
                                            {formatPeso(subtotal)}
                                        </dd>
                                    </div>
                                    <div className="flex justify-between gap-4 text-(--muted)">
                                        <dt>Shipping & fees</dt>
                                        <dd className="text-right text-xs leading-snug">
                                            Finalized at checkout
                                        </dd>
                                    </div>
                                </dl>
                                <div className="mt-6 border-t border-white/10 pt-6">
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--muted)">
                                        Total investment
                                    </p>
                                    <p className="mt-1 text-2xl font-bold tabular-nums text-(--accent)">
                                        {formatPeso(subtotal)}
                                    </p>
                                </div>
                                <Link
                                    href={checkoutHref}
                                    className={cn(
                                        "mt-6 flex h-12 w-full items-center justify-center bg-(--accent) text-center text-sm font-bold uppercase tracking-[0.12em] text-[#030608] transition hover:brightness-110"
                                    )}
                                >
                                    {user?.role === "buyer"
                                        ? "Proceed to checkout"
                                        : "Sign in to checkout"}
                                </Link>

                                <div className="mt-6 flex items-center justify-center gap-6 text-(--muted)">
                                    <Lock className="h-4 w-4" aria-hidden />
                                    <CreditCard className="h-4 w-4" aria-hidden />
                                    <Shield className="h-4 w-4" aria-hidden />
                                </div>
                            </div>
                            <p className="mt-4 px-1 text-center text-[10px] leading-relaxed text-(--muted)">
                                All listings are reviewed for quality. Structural and shipping
                                details are confirmed with the seller before dispatch.
                            </p>
                        </aside>
                    </div>
                )}
            </div>
        </main>
    );
}
