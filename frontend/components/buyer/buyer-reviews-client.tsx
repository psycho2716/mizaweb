"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ClipboardList, Pencil, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteBuyerReview, getBuyerReviews } from "@/lib/api/endpoints";
import { cn, getAppName } from "@/lib/utils";
import { useConfirmDialog } from "@/hooks/use-confirm-dialog";
import type {
    BuyerReviewPendingItem,
    BuyerReviewSubmittedItem,
    BuyerReviewsDashboardData
} from "@/types";

type TabKey = "posted" | "waiting";

function formatReviewHeaderDate(iso: string): string {
    const d = new Date(iso);
    return d
        .toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric"
        })
        .toUpperCase();
}

function formatDeliveredLine(iso: string): string {
    const d = new Date(iso);
    const formatted = d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric"
    });
    return `Delivered ${formatted}`;
}

function reviewHeadline(body: string): string | null {
    const t = body.trim();
    if (!t) {
        return null;
    }
    const line = (t.split(/\n+/)[0] ?? "").trim();
    if (line.length <= 96) {
        return line;
    }
    return `${line.slice(0, 93)}…`;
}

function SubmittedReviewBody({ body }: { body: string }) {
    const bodyTrim = body.trim();
    const headline = reviewHeadline(body);
    const showExcerpt = Boolean(headline) && headline !== bodyTrim;
    if (!bodyTrim) {
        return (
            <p className="mt-3 text-sm italic text-(--muted)">Star rating only</p>
        );
    }
    return (
        <>
            {showExcerpt ? (
                <p className="mt-3 text-sm font-semibold text-foreground">{headline}</p>
            ) : null}
            <p
                className={cn(
                    "text-sm leading-relaxed",
                    showExcerpt ? "mt-2 text-(--muted)" : "mt-3 font-medium text-foreground"
                )}
            >
                {bodyTrim}
            </p>
        </>
    );
}

function StarRow({ value }: { value: number }) {
    return (
        <div className="flex gap-0.5" role="img" aria-label={`${value} out of 5 stars`}>
            {[1, 2, 3, 4, 5].map((i) => (
                <Star
                    key={i}
                    className={cn(
                        "h-4 w-4",
                        i <= value ? "fill-(--accent) text-(--accent)" : "fill-none text-white/20"
                    )}
                    aria-hidden
                />
            ))}
        </div>
    );
}

function tabClass(active: boolean) {
    return cn(
        "border-b-2 pb-3 text-sm font-semibold transition-colors",
        active
            ? "border-white text-foreground"
            : "border-transparent text-(--muted) hover:text-foreground/80"
    );
}

export function BuyerReviewsClient() {
    const appName = getAppName();
    const autoTabRef = useRef(false);
    const { requestConfirm, dialog: confirmDialog } = useConfirmDialog();
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<BuyerReviewsDashboardData | null>(null);
    const [tab, setTab] = useState<TabKey>("posted");
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await getBuyerReviews();
            setData(res.data);
        } catch {
            setData(null);
            toast.error("Could not load your reviews.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        if (!data || autoTabRef.current) {
            return;
        }
        if (data.submitted.length === 0 && data.pending.length > 0) {
            setTab("waiting");
            autoTabRef.current = true;
        }
    }, [data]);

    const stats = data?.stats;

    const handleDelete = useCallback(
        async (item: BuyerReviewSubmittedItem) => {
            const ok = await requestConfirm({
                title: "Remove this review?",
                description:
                    "You can write a new one later if the product is still eligible.",
                confirmLabel: "Remove review",
                destructive: true
            });
            if (!ok) {
                return;
            }
            setDeletingId(item.id);
            try {
                await deleteBuyerReview(item.id);
                toast.success("Review removed.");
                await load();
            } catch (e) {
                toast.error(e instanceof Error ? e.message : "Could not delete review.");
            } finally {
                setDeletingId(null);
            }
        },
        [load, requestConfirm]
    );

    const pendingPreview = useMemo(() => data?.pending.slice(0, 4) ?? [], [data]);

    return (
        <main className="relative min-h-screen flex-1 overflow-hidden bg-[#050508] text-foreground">
            <div
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_38%_at_20%_-8%,rgba(34,199,243,0.09),transparent_55%)]"
                aria-hidden
            />

            <div className="relative z-10 mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
                <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-(--accent)">
                    User Reviews
                </p>
                <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl lg:text-[2.35rem] lg:leading-tight">
                    My reviews
                </h1>

                <div className="mt-8 flex flex-wrap gap-8 border-b border-white/10">
                    <button
                        type="button"
                        className={tabClass(tab === "posted")}
                        onClick={() => setTab("posted")}
                    >
                        Posted reviews ({stats?.submittedCount ?? 0})
                    </button>
                    <button
                        type="button"
                        className={tabClass(tab === "waiting")}
                        onClick={() => setTab("waiting")}
                    >
                        Waiting for your review ({stats?.pendingCount ?? 0})
                    </button>
                </div>

                <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-12 xl:grid-cols-[minmax(0,1fr)_340px]">
                    <div className="min-w-0">
                        {loading ? (
                            <div className="space-y-6 animate-pulse">
                                {[1, 2].map((i) => (
                                    <div
                                        key={i}
                                        className="h-40 rounded-lg border border-white/10 bg-white/4"
                                    />
                                ))}
                            </div>
                        ) : tab === "posted" ? (
                            data && data.submitted.length > 0 ? (
                                <ul className="space-y-6">
                                    {data.submitted.map((item) => (
                                        <li
                                            key={item.id}
                                            className="border border-white/10 bg-[#080b10]/80 p-5 sm:p-6"
                                        >
                                            <div className="flex flex-col gap-4 sm:flex-row sm:gap-5">
                                                <div className="h-20 w-20 shrink-0 overflow-hidden bg-[#12161f] sm:h-24 sm:w-24">
                                                    {item.thumbnailUrl ? (
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img
                                                            src={item.thumbnailUrl}
                                                            alt=""
                                                            className="h-full w-full object-cover"
                                                        />
                                                    ) : (
                                                        <div className="flex h-full items-center justify-center text-xs text-(--muted)">
                                                            —
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                                        <p className="text-sm font-bold leading-snug text-foreground sm:text-base">
                                                            {item.productTitle}
                                                        </p>
                                                        <time
                                                            className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-(--muted)"
                                                            dateTime={item.createdAt}
                                                        >
                                                            {formatReviewHeaderDate(item.createdAt)}
                                                        </time>
                                                    </div>
                                                    <div className="mt-3 flex flex-wrap items-center gap-2">
                                                        <StarRow value={item.rating} />
                                                        <span className="rounded bg-white/8 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-(--accent)">
                                                            Verified purchase
                                                        </span>
                                                    </div>
                                                    <SubmittedReviewBody body={item.body} />
                                                    <div className="mt-4 flex flex-wrap gap-4">
                                                        <Link
                                                            href={`/products/${item.productId}#client-verifications`}
                                                            className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-(--accent) hover:underline"
                                                        >
                                                            <Pencil
                                                                className="h-3.5 w-3.5"
                                                                aria-hidden
                                                            />
                                                            Edit review
                                                        </Link>
                                                        <button
                                                            type="button"
                                                            disabled={deletingId === item.id}
                                                            onClick={() => void handleDelete(item)}
                                                            className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-rose-400/95 hover:text-rose-300 disabled:opacity-50"
                                                        >
                                                            <Trash2
                                                                className="h-3.5 w-3.5"
                                                                aria-hidden
                                                            />
                                                            {deletingId === item.id
                                                                ? "Removing…"
                                                                : "Delete"}
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <div className="rounded-lg border border-white/10 bg-[#080b10]/60 px-6 py-12 text-center">
                                    <p className="text-sm text-(--muted)">
                                        You have not posted any reviews yet. When an order is marked
                                        delivered, you can rate those items here.
                                    </p>
                                    <Link
                                        href="/buyer/orders"
                                        className="mt-6 inline-flex text-sm font-semibold text-(--accent) hover:underline"
                                    >
                                        Go to your orders
                                    </Link>
                                </div>
                            )
                        ) : data && data.pending.length > 0 ? (
                            <ul className="space-y-5">
                                {data.pending.map((p) => (
                                    <PendingRow key={p.productId} item={p} />
                                ))}
                            </ul>
                        ) : (
                            <div className="rounded-lg border border-white/10 bg-[#080b10]/60 px-6 py-12 text-center">
                                <p className="text-sm text-(--muted)">
                                    Nothing is waiting for a review right now. Reviews unlock after
                                    a seller marks your order as delivered.
                                </p>
                            </div>
                        )}
                    </div>

                    <aside className="space-y-8 lg:pt-1">
                        <div className="border border-white/10 bg-[#0e131c] p-5">
                            <div className="flex items-center gap-2 border-b border-white/10 pb-4">
                                <ClipboardList className="h-5 w-5 text-(--accent)" aria-hidden />
                                <h2 className="text-sm font-bold tracking-tight">
                                    Waiting for your review
                                </h2>
                            </div>
                            {loading ? (
                                <p className="mt-4 text-xs text-(--muted)">Loading…</p>
                            ) : pendingPreview.length > 0 ? (
                                <ul className="mt-4 space-y-4">
                                    {pendingPreview.map((p) => (
                                        <li key={p.productId} className="flex gap-3">
                                            <div className="h-12 w-12 shrink-0 overflow-hidden bg-[#12161f]">
                                                {p.thumbnailUrl ? (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img
                                                        src={p.thumbnailUrl}
                                                        alt=""
                                                        className="h-full w-full object-cover"
                                                    />
                                                ) : null}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-[9px] font-semibold uppercase tracking-wide text-(--muted)">
                                                    {formatDeliveredLine(p.orderReferenceAt)}
                                                </p>
                                                <p className="mt-0.5 text-sm font-semibold leading-snug text-foreground">
                                                    {p.productTitle}
                                                </p>
                                                <Link
                                                    href={`/products/${p.productId}#client-verifications`}
                                                    className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-(--accent) hover:underline"
                                                >
                                                    Write a review
                                                    <ArrowRight className="h-3 w-3" aria-hidden />
                                                </Link>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="mt-4 text-xs leading-relaxed text-(--muted)">
                                    You are all caught up—no delivered items need a review.
                                </p>
                            )}
                        </div>

                        <div className="border border-white/10 bg-[#0e131c] p-5">
                            <h2 className="text-sm font-bold tracking-tight">
                                How your reviews help
                            </h2>
                            <div className="mt-5 grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-2xl font-bold tabular-nums text-foreground">
                                        {stats?.submittedCount ?? 0}
                                    </p>
                                    <p className="mt-1 text-[9px] font-semibold uppercase tracking-wide text-(--muted)">
                                        Reviews you shared
                                    </p>
                                </div>
                                <div>
                                    <p className="text-2xl font-bold tabular-nums text-foreground">
                                        {stats?.uniqueProductsRated ?? 0}
                                    </p>
                                    <p className="mt-1 text-[9px] font-semibold uppercase tracking-wide text-(--muted)">
                                        Different items rated
                                    </p>
                                </div>
                            </div>
                            <p className="mt-5 text-xs leading-relaxed text-(--muted)">
                                Verified purchase reviews help other buyers choose natural stone
                                pieces with confidence on {appName}.
                            </p>
                        </div>
                    </aside>
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
                                        href="/buyer/orders"
                                        className="text-foreground/90 hover:text-(--accent)"
                                    >
                                        Your orders
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
            {confirmDialog}
        </main>
    );
}

function PendingRow({ item: p }: { item: BuyerReviewPendingItem }) {
    return (
        <li className="flex flex-col gap-4 border border-white/10 bg-[#080b10]/80 p-5 sm:flex-row sm:items-center sm:gap-5">
            <div className="h-20 w-20 shrink-0 overflow-hidden bg-[#12161f] sm:h-24 sm:w-24">
                {p.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                ) : null}
            </div>
            <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-(--muted)">
                    {formatDeliveredLine(p.orderReferenceAt)}
                </p>
                <p className="mt-1 text-base font-bold text-foreground">{p.productTitle}</p>
                <Link
                    href={`/products/${p.productId}#client-verifications`}
                    className="mt-3 inline-flex items-center gap-1.5 bg-(--accent) px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-[#030608] hover:brightness-110"
                >
                    Write a review
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
            </div>
        </li>
    );
}
