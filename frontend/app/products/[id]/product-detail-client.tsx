"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, MessageCircle, Quote, ShoppingBag, Star, Store } from "lucide-react";
import { toast } from "sonner";
import { ProductViewModeToggle } from "@/components/product/product-view-mode-toggle";
import { ProductModelPreview } from "@/components/seller/product-model-preview";
import { BuyerAIGuidanceClient } from "@/components/buyer/buyer-ai-guidance-client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ApiRequestError } from "@/lib/api/client";
import {
    addCartItem,
    clearCartItems,
    getProductReviewEligibility,
    getProductReviews,
    postProductReview
} from "@/lib/api/endpoints";
import { getListingVideoPlayerKind, listingYoutubeEmbedUrlAutoplay } from "@/lib/listing-video";
import { buildProductModelViewerCustomization } from "@/lib/product-model-viewer-customization";
import { cn, formatPeso } from "@/lib/utils";
import type {
    AuthUser,
    CartItemSelection,
    ProductDetail,
    ProductHeroMediaMode,
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
    const listingVideoUrl = product.videoUrl?.trim() ?? "";
    const hasListingVideo = listingVideoUrl.length > 0;

    const [quantity, setQuantity] = useState(1);
    const [selectedImage, setSelectedImage] = useState(product.media[0]?.url ?? "");
    const [heroMediaMode, setHeroMediaMode] = useState<ProductHeroMediaMode>(() => {
        const hasVideo = (product.videoUrl?.trim() ?? "").length > 0;
        const has3d = (product.model3dUrl?.trim() ?? "").length > 0;
        if (has3d && product.media.length === 0 && !hasVideo) {
            return "3d";
        }
        return "image";
    });
    const [videoMountKey, setVideoMountKey] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedSpecs, setSelectedSpecs] = useState<Record<string, string>>({});
    const [viewer, setViewer] = useState<AuthUser | null>(null);

    const customizationOptionsKey = useMemo(
        () => product.options.map((o) => `${o.id}:${o.values.join("\u001f")}`).join("|"),
        [product.options]
    );

    useEffect(() => {
        setSelectedSpecs(() => {
            const next: Record<string, string> = {};
            for (const o of product.options) {
                const first = o.values[0];
                if (first) {
                    next[o.id] = first;
                }
            }
            return next;
        });
    }, [product.id, customizationOptionsKey]); // eslint-disable-line react-hooks/exhaustive-deps -- key encodes `product.options`
    const [reviews, setReviews] = useState<ProductReview[]>([]);
    const [summary, setSummary] = useState<ProductReviewSummary>(
        product.reviewSummary ?? { averageRating: null, reviewCount: 0 }
    );
    const [ratingPick, setRatingPick] = useState(5);
    const [reviewBody, setReviewBody] = useState("");
    const [reviewSubmitting, setReviewSubmitting] = useState(false);
    const [reviewGate, setReviewGate] = useState<{
        loading: boolean;
        hasCompletedPurchase: boolean;
        eligible: boolean;
        cooldownEndsAt: string | null;
    } | null>(null);

    const heroModes = useMemo((): ProductHeroMediaMode[] => {
        const modes: ProductHeroMediaMode[] = [];
        if (!hasModel3d && !hasListingVideo) {
            return modes;
        }
        modes.push("image");
        if (hasModel3d) {
            modes.push("3d");
        }
        if (hasListingVideo) {
            modes.push("video");
        }
        return modes;
    }, [hasModel3d, hasListingVideo]);

    const handleHeroMediaSelect = useCallback((mode: ProductHeroMediaMode) => {
        setHeroMediaMode(mode);
        if (mode === "video") {
            setVideoMountKey((k) => k + 1);
        }
    }, []);

    useEffect(() => {
        if (!heroModes.includes(heroMediaMode)) {
            setHeroMediaMode("image");
        }
    }, [heroModes, heroMediaMode]);

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

    useEffect(() => {
        if (!product.isPublished || viewer?.role !== "buyer") {
            setReviewGate(null);
            return;
        }
        const tok = typeof window !== "undefined" ? localStorage.getItem("miza_token") : null;
        if (!tok) {
            setReviewGate(null);
            return;
        }
        let cancelled = false;
        setReviewGate({
            loading: true,
            hasCompletedPurchase: false,
            eligible: false,
            cooldownEndsAt: null
        });
        void getProductReviewEligibility(product.id)
            .then((res) => {
                if (cancelled) {
                    return;
                }
                setReviewGate({
                    loading: false,
                    hasCompletedPurchase: res.data.hasCompletedPurchase,
                    eligible: res.data.eligible,
                    cooldownEndsAt: res.data.cooldownEndsAt
                });
            })
            .catch(() => {
                if (cancelled) {
                    return;
                }
                setReviewGate({
                    loading: false,
                    hasCompletedPurchase: false,
                    eligible: false,
                    cooldownEndsAt: null
                });
            });
        return () => {
            cancelled = true;
        };
    }, [product.id, product.isPublished, viewer?.role]);

    useEffect(() => {
        if (!viewer?.id) {
            return;
        }
        const mine = reviews.find((r) => r.buyerId === viewer.id);
        if (mine) {
            setRatingPick(mine.rating);
            setReviewBody(mine.body);
        }
    }, [reviews, viewer?.id]);

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

    const buildCartSelectionsPayload = useCallback((): CartItemSelection[] => {
        return product.options
            .map((o) => {
                const picked = selectedSpecs[o.id];
                const value = picked && o.values.includes(picked) ? picked : (o.values[0] ?? "");
                return { optionId: o.id, value };
            })
            .filter((row) => row.value.length > 0);
    }, [product.options, selectedSpecs]);

    async function handleAddToCart() {
        if (!canPurchase || quantity < 1) {
            toast.error(outOfStock ? "This item is out of stock." : "Choose a valid quantity.");
            return;
        }
        setIsSubmitting(true);
        try {
            await addCartItem(product.id, quantity, buildCartSelectionsPayload());
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
            const params = new URLSearchParams({
                prepareBuy: product.id,
                qty: String(quantity)
            });
            const specs = buildCartSelectionsPayload();
            if (specs.length > 0) {
                params.set("specs", encodeURIComponent(JSON.stringify(specs)));
            }
            router.push(
                `/auth/login?callbackUrl=${encodeURIComponent(`/buyer/checkout?${params}`)}`
            );
            return;
        }
        let buyerRole = viewer?.role;
        if (!buyerRole && typeof window !== "undefined") {
            try {
                const raw = localStorage.getItem("miza_user");
                buyerRole = raw
                    ? ((JSON.parse(raw) as AuthUser).role as AuthUser["role"])
                    : undefined;
            } catch {
                buyerRole = undefined;
            }
        }
        if (buyerRole !== "buyer") {
            toast.error("Sign in with a shopper account to buy.");
            return;
        }

        setIsSubmitting(true);
        try {
            await clearCartItems();
            await addCartItem(product.id, quantity, buildCartSelectionsPayload());
            router.push("/buyer/checkout");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not start checkout");
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
            try {
                const elig = await getProductReviewEligibility(product.id);
                setReviewGate({
                    loading: false,
                    hasCompletedPurchase: elig.data.hasCompletedPurchase,
                    eligible: elig.data.eligible,
                    cooldownEndsAt: elig.data.cooldownEndsAt
                });
            } catch {
                /* ignore */
            }
        } catch (error) {
            if (error instanceof ApiRequestError && error.cooldownEndsAt) {
                toast.error(
                    `${error.message} You can post again after ${new Date(error.cooldownEndsAt).toLocaleString()}.`
                );
            } else {
                toast.error(error instanceof Error ? error.message : "Could not save review");
            }
        } finally {
            setReviewSubmitting(false);
        }
    }

    const token = typeof window !== "undefined" ? localStorage.getItem("miza_token") : null;
    const showWriteReviewCard = Boolean(
        token &&
        viewer?.role === "buyer" &&
        product.isPublished &&
        reviewGate &&
        !reviewGate.loading &&
        reviewGate.eligible
    );

    const lineTotal = product.basePrice * Math.max(0, quantity);

    const stockLine = product.madeToOrder
        ? "Made to order — production timeline may apply."
        : typeof product.stockQuantity === "number"
          ? `${product.stockQuantity} available`
          : null;

    const showHero3d = hasModel3d && heroMediaMode === "3d";
    const showHeroVideo = hasListingVideo && heroMediaMode === "video";

    const viewerCustomization = useMemo(
        () => buildProductModelViewerCustomization(product.options, selectedSpecs),
        [product.options, selectedSpecs]
    );

    const showLivePreviewHint = hasModel3d && product.options.length > 0;

    const listingVideoIsYoutube =
        listingVideoUrl.length > 0 && getListingVideoPlayerKind(listingVideoUrl) === "youtube";
    const listingYoutubeIframeSrcAutoplay =
        listingVideoIsYoutube && listingVideoUrl.length > 0
            ? listingYoutubeEmbedUrlAutoplay(listingVideoUrl)
            : null;

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
                    <div className="rounded-[1.85rem] border border-white/10 bg-[linear-gradient(165deg,#161b24_0%,#0c0f14_55%,#090c11_100%)] p-2 shadow-[inset_0_2px_18px_rgba(0,0,0,0.65),0_0_0_1px_rgba(0,0,0,0.4),0_12px_40px_-24px_rgba(34,199,243,0.12)]">
                        <div
                            className={cn(
                                "relative aspect-square w-full overflow-hidden rounded-2xl border border-white/[0.07] bg-[#050608] shadow-[inset_0_2px_12px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.04)]",
                                (showHero3d || showHeroVideo) &&
                                    "border-(--accent)/30 shadow-[inset_0_2px_12px_rgba(0,0,0,0.5),0_0_24px_-8px_rgba(34,199,243,0.2)]"
                            )}
                        >
                            {showHero3d ? (
                                <ProductModelPreview
                                    key={model3dUrl}
                                    modelUrl={model3dUrl}
                                    customization={viewerCustomization}
                                    className="absolute inset-0 h-full min-h-0 w-full cursor-grab active:cursor-grabbing"
                                />
                            ) : showHeroVideo ? (
                                <div className="absolute inset-0 flex items-center justify-center bg-black">
                                    {listingVideoIsYoutube && listingYoutubeIframeSrcAutoplay ? (
                                        <iframe
                                            key={videoMountKey}
                                            src={listingYoutubeIframeSrcAutoplay}
                                            title={`${product.title} — listing video`}
                                            className="h-full w-full border-0"
                                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                            allowFullScreen
                                        />
                                    ) : listingVideoIsYoutube ? (
                                        <div className="flex max-w-md flex-col items-center justify-center gap-3 px-4 text-center text-sm text-(--muted)">
                                            <p>This YouTube link could not be embedded.</p>
                                            <a
                                                href={listingVideoUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="font-semibold text-(--accent) underline-offset-4 hover:underline"
                                            >
                                                Open video on YouTube →
                                            </a>
                                        </div>
                                    ) : (
                                        <video
                                            key={videoMountKey}
                                            src={listingVideoUrl}
                                            controls
                                            playsInline
                                            muted
                                            autoPlay
                                            preload="auto"
                                            className="h-full w-full object-contain"
                                            aria-label={`Video for ${product.title}`}
                                        >
                                            Your browser does not support embedded video.
                                        </video>
                                    )}
                                </div>
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
                                            onClick={() => handleHeroMediaSelect("3d")}
                                        >
                                            Open 3D preview
                                        </Button>
                                    ) : null}
                                    {hasListingVideo ? (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleHeroMediaSelect("video")}
                                        >
                                            Play listing video
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

                        {heroModes.length >= 2 ? (
                            <div className="mt-3 px-1 pb-0.5 sm:mt-3.5">
                                <ProductViewModeToggle
                                    modes={heroModes}
                                    active={heroMediaMode}
                                    onSelect={handleHeroMediaSelect}
                                />
                            </div>
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
                                        handleHeroMediaSelect("image");
                                    }}
                                    className={cn(
                                        "rounded-lg border bg-[#080b10] p-1 ring-1 ring-white/4 transition-colors",
                                        selectedImage === image.url && heroMediaMode === "image"
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
                                    Total Price
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
                                Product Customizations
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

                    {viewer?.role === "buyer" && token ? (
                        <BuyerAIGuidanceClient enabled={true} product={product} />
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
                                href={`/auth/login?callbackUrl=${encodeURIComponent(`/buyer/messages?seller=${product.sellerId}`)}`}
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
                            {token && viewer?.role === "buyer" ? (
                                <>
                                    {reviewGate === null || reviewGate.loading ? (
                                        <p className="rounded-xl border border-(--border) bg-[#080b10]/60 px-5 py-4 text-sm text-(--muted)">
                                            Checking review options…
                                        </p>
                                    ) : null}
                                    {showWriteReviewCard ? (
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
                                                After a delivered order, you can post or update a
                                                review for this product once every 30 days.
                                            </p>
                                        </div>
                                    ) : null}
                                    {reviewGate && !reviewGate.loading && !reviewGate.eligible ? (
                                        <p className="rounded-xl border border-(--border) bg-[#080b10]/60 px-5 py-4 text-sm text-(--muted)">
                                            {!reviewGate.hasCompletedPurchase ? (
                                                <>
                                                    You can leave a review for this product once you
                                                    have ordered and received it from this shop.
                                                </>
                                            ) : reviewGate.cooldownEndsAt ? (
                                                <>
                                                    You recently posted or updated your review. You
                                                    can change it again after{" "}
                                                    <span className="font-medium text-foreground">
                                                        {new Date(
                                                            reviewGate.cooldownEndsAt
                                                        ).toLocaleString()}
                                                    </span>
                                                    .
                                                </>
                                            ) : (
                                                "You cannot post a review for this product right now."
                                            )}
                                        </p>
                                    ) : null}
                                </>
                            ) : (
                                <p className="rounded-xl border border-(--border) bg-[#080b10]/60 px-5 py-4 text-sm text-(--muted)">
                                    <Link
                                        href={`/auth/login?callbackUrl=${encodeURIComponent(`/products/${product.id}`)}`}
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
