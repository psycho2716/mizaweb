"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
    Box,
    ChevronRight,
    Image as ImageIcon,
    MessageCircle,
    Quote,
    ShoppingBag,
    Star,
    Store
} from "lucide-react";
import { toast } from "sonner";
import { ProductModelPreview } from "@/components/seller/product-model-preview";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
    addCartItem,
    checkoutCart,
    getProductReviews,
    postProductReview
} from "@/lib/api/endpoints";
import { buildProductModelViewerCustomization } from "@/lib/product-model-viewer-customization";
import { cn, formatPeso } from "@/lib/utils";
import type {
    AuthUser,
    ProductDetail,
    ProductOption,
    ProductReview,
    ProductReviewSummary
} from "@/types";

const fieldClass =
    "h-10 w-full rounded-md border border-(--border) bg-[#080b10] px-3 text-sm text-foreground placeholder:text-(--muted) focus-visible:border-(--accent)/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/25";

interface ProductDetailClientProps {
    product: ProductDetail;
}

function StarRatingDisplay({ value }: { value: number }) {
    const rounded = Math.min(5, Math.max(0, Math.round(value)));
    return (
        <div className="flex items-center gap-0.5 text-(--accent)" aria-hidden>
            {Array.from({ length: 5 }, (_, i) => (
                <Star
                    key={i}
                    className={cn("h-4 w-4", i < rounded ? "fill-current" : "fill-none opacity-25")}
                />
            ))}
        </div>
    );
}

function InteractiveStars({ value, onChange }: { value: number; onChange: (n: number) => void }) {
    return (
        <div className="flex items-center gap-1" role="group" aria-label="Your rating">
            {Array.from({ length: 5 }, (_, i) => {
                const n = i + 1;
                const on = n <= value;
                return (
                    <button
                        key={n}
                        type="button"
                        onClick={() => onChange(n)}
                        className="rounded p-0.5 text-(--accent) transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/40"
                        aria-label={`${n} star${n === 1 ? "" : "s"}`}
                    >
                        <Star
                            className={cn("h-6 w-6", on ? "fill-current" : "fill-none opacity-30")}
                        />
                    </button>
                );
            })}
        </div>
    );
}

function OptionField({
    option,
    value,
    onChange
}: {
    option: ProductOption;
    value: string;
    onChange: (next: string) => void;
}) {
    const useChips = option.values.length > 0 && option.values.length <= 6;

    return (
        <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-(--muted)">
                {option.name}
            </p>
            {useChips ? (
                <div className="flex flex-wrap gap-2">
                    {option.values.map((v) => {
                        const active = value === v;
                        return (
                            <button
                                key={v}
                                type="button"
                                onClick={() => onChange(v)}
                                className={cn(
                                    "min-h-10 rounded-md border px-3 py-2 text-xs font-semibold uppercase tracking-wider transition-colors",
                                    active
                                        ? "border-(--accent) bg-(--accent)/15 text-(--accent)"
                                        : "border-(--border) bg-[#080b10] text-(--muted) hover:border-(--accent)/40 hover:text-foreground"
                                )}
                            >
                                {v}
                            </button>
                        );
                    })}
                </div>
            ) : (
                <select
                    className={fieldClass}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                >
                    <option value="">Select {option.name}</option>
                    {option.values.map((v) => (
                        <option key={v} value={v}>
                            {v}
                        </option>
                    ))}
                </select>
            )}
        </div>
    );
}

function ReviewStarDistribution({ reviews }: { reviews: ProductReview[] }) {
    const counts = useMemo(() => {
        const c = [0, 0, 0, 0, 0];
        for (const r of reviews) {
            const b = Math.min(5, Math.max(1, Math.round(r.rating))) - 1;
            c[b] += 1;
        }
        return c;
    }, [reviews]);
    const max = Math.max(1, ...counts);

    return (
        <div className="space-y-2">
            {[5, 4, 3, 2, 1].map((stars) => {
                const idx = stars - 1;
                const n = counts[idx];
                const pct = Math.round((n / max) * 100);
                return (
                    <div key={stars} className="flex items-center gap-2 text-[11px] text-(--muted)">
                        <span className="w-16 tabular-nums">{stars}★</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#12161f]">
                            <div
                                className="h-full rounded-full bg-(--accent)/70 transition-[width]"
                                style={{ width: `${pct}%` }}
                            />
                        </div>
                        <span className="w-6 text-right tabular-nums text-foreground">{n}</span>
                    </div>
                );
            })}
        </div>
    );
}

export function ProductDetailClient({ product }: ProductDetailClientProps) {
    const router = useRouter();
    const model3dUrl = product.model3dUrl?.trim() ?? "";
    const hasModel3d = model3dUrl.length > 0;

    const [quantity, setQuantity] = useState(1);
    const [selectedImage, setSelectedImage] = useState(product.media[0]?.url ?? "");
    const [threeDActive, setThreeDActive] = useState(hasModel3d && product.media.length === 0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedSpecs, setSelectedSpecs] = useState<Record<string, string>>({});
    const [viewer, setViewer] = useState<AuthUser | null>(null);
    const [reviews, setReviews] = useState<ProductReview[]>([]);
    const [summary, setSummary] = useState<ProductReviewSummary>(
        product.reviewSummary ?? { averageRating: null, reviewCount: 0 }
    );
    const [ratingPick, setRatingPick] = useState(5);
    const [reviewBody, setReviewBody] = useState("");
    const [reviewSubmitting, setReviewSubmitting] = useState(false);

    useEffect(() => {
        try {
            const raw = localStorage.getItem("miza_user");
            setViewer(raw ? (JSON.parse(raw) as AuthUser) : null);
        } catch {
            setViewer(null);
        }
    }, []);

    useEffect(() => {
        if (!product.isPublished) {
            return;
        }
        getProductReviews(product.id)
            .then((r) => setReviews(r.data))
            .catch(() => setReviews([]));
    }, [product.id, product.isPublished]);

    const maxPurchasableQuantity = useMemo(() => {
        if (product.madeToOrder) {
            return null;
        }
        if (typeof product.stockQuantity !== "number") {
            return null;
        }
        return Math.max(0, product.stockQuantity);
    }, [product.madeToOrder, product.stockQuantity]);

    useEffect(() => {
        if (maxPurchasableQuantity === null) {
            return;
        }
        setQuantity((previous) => {
            if (maxPurchasableQuantity === 0) {
                return 0;
            }
            return Math.min(Math.max(1, previous), maxPurchasableQuantity);
        });
    }, [maxPurchasableQuantity, product.id]);

    function handleQuantityChange(raw: string) {
        const n = Number(raw);
        if (!Number.isFinite(n)) {
            setQuantity(maxPurchasableQuantity === 0 ? 0 : 1);
            return;
        }
        const intVal = Math.floor(n);
        if (maxPurchasableQuantity === null) {
            setQuantity(Math.max(1, intVal));
            return;
        }
        if (maxPurchasableQuantity === 0) {
            setQuantity(0);
            return;
        }
        setQuantity(Math.min(Math.max(1, intVal), maxPurchasableQuantity));
    }

    const outOfStock = maxPurchasableQuantity === 0;
    const canPurchase = !outOfStock && quantity >= 1;

    async function handleAddToCart() {
        if (!canPurchase || quantity < 1) {
            toast.error(outOfStock ? "This item is out of stock." : "Choose a valid quantity.");
            return;
        }
        setIsSubmitting(true);
        try {
            await addCartItem(product.id, quantity);
            toast.success("Added to cart");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to add to cart");
        } finally {
            setIsSubmitting(false);
        }
    }

    async function handleBuyNow() {
        if (!canPurchase || quantity < 1) {
            toast.error(outOfStock ? "This item is out of stock." : "Choose a valid quantity.");
            return;
        }
        const token = typeof window !== "undefined" ? localStorage.getItem("miza_token") : null;
        if (!token) {
            toast.info("Please login before checkout.");
            router.push("/auth/login");
            return;
        }

        setIsSubmitting(true);
        try {
            await addCartItem(product.id, quantity);
            await checkoutCart({ paymentMethod: "cash" });
            toast.success("Order placed");
            router.push("/buyer/orders");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Checkout failed");
        } finally {
            setIsSubmitting(false);
        }
    }

    async function handleSubmitReview() {
        if (!viewer || viewer.role !== "buyer") {
            return;
        }
        setReviewSubmitting(true);
        try {
            await postProductReview(product.id, ratingPick, reviewBody.trim());
            const list = await getProductReviews(product.id);
            setReviews(list.data);
            const sum = list.data.reduce((acc, r) => acc + r.rating, 0);
            const cnt = list.data.length;
            setSummary({
                averageRating: cnt ? Math.round((sum / cnt) * 10) / 10 : null,
                reviewCount: cnt
            });
            setReviewBody("");
            toast.success("Thanks — your review is live.");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not save review");
        } finally {
            setReviewSubmitting(false);
        }
    }

    const token = typeof window !== "undefined" ? localStorage.getItem("miza_token") : null;
    const canReview = Boolean(token && viewer?.role === "buyer" && product.isPublished);

    const lineTotal = product.basePrice * Math.max(0, quantity);

    const stockLine = product.madeToOrder
        ? "Made to order — production timeline may apply."
        : typeof product.stockQuantity === "number"
          ? `${product.stockQuantity} available`
          : null;

    const showHero3d = hasModel3d && threeDActive;

    const viewerCustomization = useMemo(
        () => buildProductModelViewerCustomization(product.options, selectedSpecs),
        [product.options, selectedSpecs]
    );

    const showLivePreviewHint = hasModel3d && product.options.length > 0;

    return (
        <main className="mx-auto flex max-w-6xl flex-1 flex-col gap-10 px-4 py-8 sm:px-6 lg:py-12">
            <nav className="flex flex-wrap items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-(--muted)">
                <Link href="/" className="hover:text-(--accent)">
                    Home
                </Link>
                <ChevronRight className="h-3 w-3 shrink-0 opacity-50" aria-hidden />
                <Link href="/products" className="hover:text-(--accent)">
                    Shop
                </Link>
                <ChevronRight className="h-3 w-3 shrink-0 opacity-50" aria-hidden />
                <span className="max-w-[min(100%,28rem)] truncate text-foreground/90">
                    {product.title}
                </span>
            </nav>

            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-12 lg:items-start">
                {/* Media column */}
                <div className="space-y-4">
                    {hasModel3d ? (
                        <div className="relative overflow-hidden rounded-2xl border border-cyan-400/20 bg-[#06080c]/75 p-3 shadow-[0_0_40px_-12px_var(--accent)] backdrop-blur-md sm:flex sm:items-center sm:justify-between sm:gap-4">
                            <div
                                className="pointer-events-none absolute inset-0 bg-[linear-gradient(105deg,transparent_40%,rgba(34,211,238,0.04)_50%,transparent_60%)]"
                                aria-hidden
                            />
                            <div className="relative mb-3 sm:mb-0">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-(--accent) drop-shadow-[0_0_12px_var(--accent)]">
                                    Active view
                                </p>
                                <p className="mt-0.5 text-xs font-medium tracking-tight text-foreground">
                                    {showHero3d ? "3D model" : "Photo gallery"}
                                </p>
                            </div>
                            <div
                                className="relative isolate flex w-full min-w-[min(100%,15.5rem)] max-w-68 shrink-0 rounded-2xl border border-white/10 bg-black/35 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-sm sm:ml-auto sm:w-auto"
                                role="group"
                                aria-label="Toggle 3D viewer"
                            >
                                <span
                                    aria-hidden
                                    className={cn(
                                        "absolute bottom-1 top-1 w-[calc(50%-6px)] rounded-xl bg-linear-to-b from-cyan-100 via-cyan-300 to-cyan-500",
                                        "shadow-[0_0_22px_rgba(34,211,238,0.55),0_0_40px_rgba(34,211,238,0.2),inset_0_1px_0_rgba(255,255,255,0.45)]",
                                        "motion-safe:transition-[left,box-shadow] motion-safe:duration-500 motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)]",
                                        showHero3d ? "left-[calc(50%+2px)]" : "left-1"
                                    )}
                                />
                                <button
                                    type="button"
                                    onClick={() => setThreeDActive(false)}
                                    className={cn(
                                        "relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[10px] font-bold uppercase tracking-[0.18em] transition-colors duration-300 motion-reduce:transition-none",
                                        !showHero3d
                                            ? "text-zinc-950"
                                            : "text-zinc-500 hover:text-zinc-200"
                                    )}
                                >
                                    <ImageIcon
                                        className="h-3.5 w-3.5 opacity-90"
                                        strokeWidth={2}
                                        aria-hidden
                                    />
                                    Image Viewer
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setThreeDActive(true)}
                                    className={cn(
                                        "relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[10px] font-bold uppercase tracking-[0.18em] transition-colors duration-300 motion-reduce:transition-none",
                                        showHero3d
                                            ? "text-zinc-950"
                                            : "text-zinc-500 hover:text-zinc-200"
                                    )}
                                >
                                    <Box
                                        className="h-3.5 w-3.5 opacity-90"
                                        strokeWidth={2}
                                        aria-hidden
                                    />
                                    3D Viewer
                                </button>
                            </div>
                        </div>
                    ) : null}

                    <div
                        className={cn(
                            "relative aspect-square w-full overflow-hidden rounded-xl border border-(--accent)/20 bg-[#050608] ring-1 ring-white/6",
                            showHero3d && "border-(--accent)/35"
                        )}
                    >
                        {showHero3d ? (
                            <ProductModelPreview
                                key={model3dUrl}
                                modelUrl={model3dUrl}
                                customization={viewerCustomization}
                                className="absolute inset-0 h-full min-h-0 w-full cursor-grab active:cursor-grabbing"
                            />
                        ) : selectedImage ? (
                            <img
                                src={selectedImage}
                                alt={product.title}
                                className="h-full w-full object-cover"
                            />
                        ) : (
                            <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-2 px-6 text-center text-sm text-(--muted)">
                                <p>No photos yet.</p>
                                {hasModel3d ? (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setThreeDActive(true)}
                                    >
                                        Open 3D preview
                                    </Button>
                                ) : null}
                            </div>
                        )}
                        {showHero3d ? (
                            <p className="pointer-events-none absolute bottom-3 left-0 right-0 text-center text-[10px] font-medium uppercase tracking-wider text-(--muted)">
                                Drag to rotate · scroll to zoom
                            </p>
                        ) : null}
                    </div>

                    {product.media.length > 0 ? (
                        <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                            {product.media.map((image) => (
                                <button
                                    key={image.id}
                                    type="button"
                                    onClick={() => {
                                        setSelectedImage(image.url);
                                        setThreeDActive(false);
                                    }}
                                    className={cn(
                                        "rounded-lg border bg-[#080b10] p-1 ring-1 ring-white/4 transition-colors",
                                        selectedImage === image.url && !showHero3d
                                            ? "border-(--accent) ring-(--accent)/30"
                                            : "border-(--border) hover:border-(--accent)/40"
                                    )}
                                >
                                    <img
                                        src={image.url}
                                        alt=""
                                        className="aspect-square w-full rounded-md object-cover"
                                    />
                                </button>
                            ))}
                        </div>
                    ) : null}

                    {product.videoUrl?.trim() ? (
                        <a
                            href={product.videoUrl.trim()}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block rounded-lg border border-(--border) bg-[#080b10] px-4 py-3 text-sm font-semibold text-(--accent) underline-offset-4 hover:underline"
                        >
                            Watch listing video →
                        </a>
                    ) : null}
                </div>

                {/* Detail column */}
                <div className="flex flex-col gap-6">
                    <div className="space-y-3">
                        {product.isPublished ? (
                            <div className="flex flex-wrap items-center gap-3">
                                {summary.averageRating != null ? (
                                    <>
                                        <StarRatingDisplay value={summary.averageRating} />
                                        <span className="tabular-nums text-lg font-semibold text-foreground">
                                            {summary.averageRating.toFixed(1)}
                                        </span>
                                        <a
                                            href="#client-verifications"
                                            className="text-sm font-medium text-(--accent) underline-offset-4 hover:underline"
                                        >
                                            ({summary.reviewCount}{" "}
                                            {summary.reviewCount === 1 ? "review" : "reviews"})
                                        </a>
                                    </>
                                ) : (
                                    <p className="text-sm text-(--muted)">
                                        No reviews yet — be the first.
                                    </p>
                                )}
                            </div>
                        ) : null}

                        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                            {product.title}
                        </h1>
                        <p className="max-w-xl leading-relaxed text-(--muted)">
                            {product.description}
                        </p>
                    </div>

                    <div className="rounded-xl border border-(--border) bg-[#080b10]/90 p-5 ring-1 ring-white/4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--muted)">
                            Price
                        </p>
                        <p className="mt-1 text-3xl font-bold tabular-nums text-(--accent)">
                            {formatPeso(product.basePrice)}
                        </p>
                        <p className="mt-3 text-xs text-(--muted)">
                            Per unit · taxes and shipping at checkout.
                        </p>

                        <div className="mt-5 grid gap-3 border-t border-(--border)/80 pt-5 sm:grid-cols-2">
                            <label className="block text-sm">
                                <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-(--muted)">
                                    Quantity
                                </span>
                                <input
                                    type="number"
                                    min={outOfStock ? 0 : 1}
                                    max={maxPurchasableQuantity ?? undefined}
                                    value={quantity}
                                    onChange={(event) => handleQuantityChange(event.target.value)}
                                    disabled={outOfStock}
                                    aria-valuemin={outOfStock ? 0 : 1}
                                    aria-valuemax={maxPurchasableQuantity ?? undefined}
                                    className={fieldClass}
                                />
                                {maxPurchasableQuantity !== null && maxPurchasableQuantity > 0 ? (
                                    <p className="mt-1.5 text-xs text-(--muted)">
                                        Maximum {maxPurchasableQuantity} per order (in stock).
                                    </p>
                                ) : null}
                                {outOfStock ? (
                                    <p className="mt-1.5 text-xs font-medium text-amber-400/95">
                                        Out of stock
                                    </p>
                                ) : null}
                            </label>
                            <div className="flex flex-col justify-end rounded-lg border border-(--accent)/25 bg-[#050608] px-4 py-3">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-(--muted)">
                                    Line total (estimate)
                                </p>
                                <p className="mt-1 text-xl font-bold tabular-nums text-(--accent)">
                                    {formatPeso(lineTotal)}
                                </p>
                            </div>
                        </div>

                        {stockLine ? (
                            <p className="mt-4 flex items-start gap-2 border-t border-(--border)/60 pt-4 text-xs text-(--muted)">
                                <MessageCircle
                                    className="mt-0.5 h-4 w-4 shrink-0 text-(--accent)/80"
                                    aria-hidden
                                />
                                <span>{stockLine}</span>
                            </p>
                        ) : null}

                        {product.rules.length > 0 ? (
                            <ul className="mt-4 space-y-2 border-t border-(--border)/60 pt-4 text-xs text-(--muted)">
                                {product.rules.map((rule) => (
                                    <li key={rule.id} className="flex justify-between gap-3">
                                        <span>{rule.label}</span>
                                        <span className="shrink-0 font-semibold tabular-nums text-foreground">
                                            +{formatPeso(rule.amount)}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        ) : null}
                    </div>

                    {product.options.length > 0 ? (
                        <div className="space-y-4 rounded-xl border border-(--border) bg-[#080b10]/60 p-5">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--accent)">
                                Options
                            </p>
                            <div className="space-y-4">
                                {product.options.map((option) => (
                                    <OptionField
                                        key={option.id}
                                        option={option}
                                        value={selectedSpecs[option.id] ?? ""}
                                        onChange={(next) =>
                                            setSelectedSpecs((previous) => ({
                                                ...previous,
                                                [option.id]: next
                                            }))
                                        }
                                    />
                                ))}
                            </div>
                            {showLivePreviewHint ? (
                                <p className="text-[11px] leading-relaxed text-(--accent)/90">
                                    With 3D view on, compatible options (colors, sizes, finishes)
                                    update the model in real time for a rough visual preview.
                                </p>
                            ) : null}
                            <p className="text-[11px] leading-relaxed text-(--muted)">
                                Variants you choose here are for your reference; confirm final specs
                                with the seller if needed.
                            </p>
                        </div>
                    ) : null}

                    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                        <Button
                            type="button"
                            className="h-12 flex-1 gap-2 bg-(--accent) text-[#050608] hover:bg-(--accent)/90"
                            onClick={() => void handleAddToCart()}
                            disabled={isSubmitting || !canPurchase}
                        >
                            <ShoppingBag className="h-5 w-5" aria-hidden />
                            Add to cart
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            className="h-12 flex-1 border-(--border) bg-transparent hover:bg-[#080b10]"
                            onClick={() => void handleBuyNow()}
                            disabled={isSubmitting || !canPurchase}
                        >
                            Buy now
                        </Button>
                    </div>

                    <div className="flex flex-col gap-2 border-t border-(--border)/60 pt-6 sm:flex-row sm:flex-wrap sm:gap-4">
                        <Link
                            href={`/sellers/${product.sellerId}`}
                            className="inline-flex items-center gap-2 text-sm font-semibold text-(--accent) underline-offset-4 hover:underline"
                        >
                            <Store className="h-4 w-4 shrink-0" aria-hidden />
                            View seller storefront
                        </Link>
                        {viewer?.role === "buyer" && token ? (
                            <Link
                                href={`/buyer/messages?seller=${product.sellerId}`}
                                className="inline-flex items-center gap-2 text-sm font-semibold text-(--accent) underline-offset-4 hover:underline"
                            >
                                <MessageCircle className="h-4 w-4 shrink-0" aria-hidden />
                                Message seller
                            </Link>
                        ) : (
                            <Link
                                href="/auth/login"
                                className="inline-flex items-center gap-2 text-sm text-(--muted) underline-offset-4 hover:text-(--accent) hover:underline"
                            >
                                Sign in to message the seller
                            </Link>
                        )}
                    </div>
                </div>
            </div>

            {product.isPublished ? (
                <section id="client-verifications" className="scroll-mt-24 space-y-6">
                    <div className="flex flex-wrap items-end justify-between gap-3">
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--accent)">
                                Client verifications
                            </p>
                            <h2 className="mt-1 text-2xl font-bold text-foreground">Reviews</h2>
                        </div>
                        {summary.reviewCount > 0 ? (
                            <a
                                href="#client-verifications"
                                className="text-sm font-medium text-(--accent) underline-offset-4 hover:underline"
                            >
                                View all {summary.reviewCount} reviews
                            </a>
                        ) : null}
                    </div>

                    <div className="grid gap-6 lg:grid-cols-[minmax(0,220px)_1fr]">
                        <div className="rounded-xl border border-(--border) bg-[#080b10]/90 p-6 ring-1 ring-white/4">
                            {summary.averageRating != null ? (
                                <>
                                    <p className="text-5xl font-bold tabular-nums text-foreground">
                                        {summary.averageRating.toFixed(1)}
                                    </p>
                                    <div className="mt-2">
                                        <StarRatingDisplay value={summary.averageRating} />
                                    </div>
                                    <p className="mt-2 text-xs text-(--muted)">
                                        From {summary.reviewCount}{" "}
                                        {summary.reviewCount === 1 ? "review" : "reviews"}
                                    </p>
                                </>
                            ) : (
                                <p className="text-sm text-(--muted)">No ratings yet.</p>
                            )}
                            {reviews.length > 0 ? (
                                <div className="mt-6 border-t border-(--border)/60 pt-6">
                                    <ReviewStarDistribution reviews={reviews} />
                                </div>
                            ) : null}
                        </div>

                        <div className="space-y-4">
                            {canReview ? (
                                <div className="rounded-xl border border-(--border) bg-[#080b10]/90 p-5 ring-1 ring-white/4">
                                    <p className="text-xs font-semibold uppercase tracking-wider text-(--muted)">
                                        Write a review
                                    </p>
                                    <div className="mt-2">
                                        <InteractiveStars
                                            value={ratingPick}
                                            onChange={setRatingPick}
                                        />
                                    </div>
                                    <Textarea
                                        className="mt-3 min-h-[88px] border-(--border) bg-[#050608] text-foreground"
                                        placeholder="Share what you liked or what could be better…"
                                        value={reviewBody}
                                        onChange={(e) => setReviewBody(e.target.value)}
                                    />
                                    <Button
                                        type="button"
                                        className="mt-3 bg-(--accent) text-[#050608] hover:bg-(--accent)/90"
                                        disabled={reviewSubmitting}
                                        onClick={() => void handleSubmitReview()}
                                    >
                                        {reviewSubmitting ? "Saving…" : "Post review"}
                                    </Button>
                                    <p className="mt-2 text-xs text-(--muted)">
                                        One review per account — you can update yours anytime.
                                    </p>
                                </div>
                            ) : (
                                <p className="rounded-xl border border-(--border) bg-[#080b10]/60 px-5 py-4 text-sm text-(--muted)">
                                    <Link
                                        href="/auth/login"
                                        className="font-semibold text-(--accent) underline-offset-4 hover:underline"
                                    >
                                        Sign in as a shopper
                                    </Link>{" "}
                                    to leave a rating.
                                </p>
                            )}

                            <ul className="space-y-4">
                                {reviews.map((r) => (
                                    <li
                                        key={r.id}
                                        className="rounded-xl border border-(--border) bg-[#080b10]/60 p-5 ring-1 ring-white/4"
                                    >
                                        <div className="flex items-start gap-3">
                                            <Quote
                                                className="mt-0.5 h-8 w-8 shrink-0 text-(--accent)/50"
                                                aria-hidden
                                            />
                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <StarRatingDisplay value={r.rating} />
                                                </div>
                                                <p className="mt-2 font-medium text-foreground">
                                                    {r.authorLabel}
                                                </p>
                                                {r.body.trim() ? (
                                                    <p className="mt-2 leading-relaxed text-(--muted)">
                                                        {r.body}
                                                    </p>
                                                ) : (
                                                    <p className="mt-2 text-sm italic text-(--muted)">
                                                        Rating only
                                                    </p>
                                                )}
                                                <p className="mt-2 text-xs text-(--muted)">
                                                    {new Date(r.createdAt).toLocaleDateString()}
                                                </p>
                                            </div>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                            {reviews.length === 0 ? (
                                <p className="text-sm text-(--muted)">No written reviews yet.</p>
                            ) : null}
                        </div>
                    </div>
                </section>
            ) : null}
        </main>
    );
}
