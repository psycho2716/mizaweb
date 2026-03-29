"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { addCartItem, checkoutCart, getProductReviews, postProductReview } from "@/lib/api/endpoints";
import { cn, formatPeso } from "@/lib/utils";
import type { AuthUser, ProductDetail, ProductReview, ProductReviewSummary } from "@/types";

const fieldClass =
    "h-10 w-full rounded-md border border-(--border) bg-[#080b10] px-3 text-sm text-foreground placeholder:text-(--muted) focus-visible:border-(--accent)/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/25";

interface ProductDetailClientProps {
    product: ProductDetail;
}

function StarRatingDisplay({ value }: { value: number }) {
    const rounded = Math.min(5, Math.max(0, Math.round(value)));
    return (
        <div className="flex items-center gap-0.5 text-amber-400" aria-hidden>
            {Array.from({ length: 5 }, (_, i) => (
                <Star
                    key={i}
                    className={cn("h-4 w-4", i < rounded ? "fill-current" : "fill-none opacity-25")}
                />
            ))}
        </div>
    );
}

function InteractiveStars({
    value,
    onChange
}: {
    value: number;
    onChange: (n: number) => void;
}) {
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
                        className="rounded p-0.5 text-amber-400 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/40"
                        aria-label={`${n} star${n === 1 ? "" : "s"}`}
                    >
                        <Star className={cn("h-6 w-6", on ? "fill-current" : "fill-none opacity-30")} />
                    </button>
                );
            })}
        </div>
    );
}

export function ProductDetailClient({ product }: ProductDetailClientProps) {
    const router = useRouter();
    const [quantity, setQuantity] = useState(1);
    const [selectedImage, setSelectedImage] = useState(product.media[0]?.url ?? "");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedSpecs, setSelectedSpecs] = useState<Record<string, string>>({});
    const [threeDColor, setThreeDColor] = useState("Natural");
    const [threeDTexture, setThreeDTexture] = useState("Polished");
    const [viewer, setViewer] = useState<AuthUser | null>(null);
    const [reviews, setReviews] = useState<ProductReview[]>([]);
    const [summary, setSummary] = useState<ProductReviewSummary>(
        product.reviewSummary ?? { averageRating: null, reviewCount: 0 }
    );
    const [ratingPick, setRatingPick] = useState(5);
    const [reviewBody, setReviewBody] = useState("");
    const [reviewSubmitting, setReviewSubmitting] = useState(false);

    const has3D = useMemo(() => {
        return product.options.some((option) => option.name.toLowerCase().includes("color"));
    }, [product.options]);

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

    async function handleAddToCart() {
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

    return (
        <main className="mx-auto flex max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 lg:py-10">
            <div className="grid gap-6 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--accent)">
                            Gallery
                        </p>
                        <CardTitle className="mt-1">Product images</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="h-72 overflow-hidden rounded-lg border border-(--border) bg-[#080b10] ring-1 ring-white/[0.04]">
                            {selectedImage ? (
                                <img
                                    src={selectedImage}
                                    alt={product.title}
                                    className="h-full w-full object-cover"
                                />
                            ) : (
                                <div className="flex h-full items-center justify-center text-sm text-(--muted)">
                                    No image available
                                </div>
                            )}
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                            {product.media.map((image) => (
                                <button
                                    key={image.id}
                                    type="button"
                                    onClick={() => setSelectedImage(image.url)}
                                    className="rounded-md border border-(--border) bg-[#080b10] p-1 ring-1 ring-white/[0.04] transition-colors hover:border-(--accent)/40"
                                >
                                    <img
                                        src={image.url}
                                        alt={product.title}
                                        className="h-14 w-full rounded object-cover"
                                    />
                                </button>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                <div className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>{product.title}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3 text-sm">
                            {product.isPublished ? (
                                <div className="flex flex-wrap items-center gap-3">
                                    {summary.averageRating != null ? (
                                        <>
                                            <StarRatingDisplay value={summary.averageRating} />
                                            <span className="tabular-nums font-semibold text-foreground">
                                                {summary.averageRating.toFixed(1)}
                                            </span>
                                            <span className="text-(--muted)">
                                                ({summary.reviewCount}{" "}
                                                {summary.reviewCount === 1 ? "review" : "reviews"})
                                            </span>
                                        </>
                                    ) : (
                                        <p className="text-(--muted)">No reviews yet — be the first.</p>
                                    )}
                                </div>
                            ) : null}
                            <p className="leading-relaxed text-(--muted)">{product.description}</p>
                            <p className="text-xl font-semibold tabular-nums text-(--accent)">
                                {formatPeso(product.basePrice)}
                            </p>
                            <div className="flex flex-wrap gap-3">
                                <Link
                                    href={`/sellers/${product.sellerId}`}
                                    className="inline-flex text-sm font-semibold text-(--accent) underline-offset-4 hover:underline"
                                >
                                    View seller storefront →
                                </Link>
                                {viewer?.role === "buyer" && token ? (
                                    <Link
                                        href={`/buyer/messages?seller=${product.sellerId}`}
                                        className="inline-flex text-sm font-semibold text-(--accent) underline-offset-4 hover:underline"
                                    >
                                        Message seller →
                                    </Link>
                                ) : (
                                    <Link
                                        href="/auth/login"
                                        className="inline-flex text-sm font-semibold text-(--muted) underline-offset-4 hover:text-(--accent) hover:underline"
                                    >
                                        Sign in to message the seller
                                    </Link>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Options</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {product.options.map((option) => (
                                <label key={option.id} className="block text-sm">
                                    <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-(--muted)">
                                        {option.name}
                                    </span>
                                    <select
                                        className={fieldClass}
                                        value={selectedSpecs[option.id] ?? ""}
                                        onChange={(event) =>
                                            setSelectedSpecs((previous) => ({
                                                ...previous,
                                                [option.id]: event.target.value
                                            }))
                                        }
                                    >
                                        <option value="">Select {option.name}</option>
                                        {option.values.map((value) => (
                                            <option key={value} value={value}>
                                                {value}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            ))}
                            <label className="block text-sm">
                                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-(--muted)">
                                    Quantity
                                </span>
                                <input
                                    type="number"
                                    min={1}
                                    value={quantity}
                                    onChange={(event) => setQuantity(Number(event.target.value))}
                                    className={fieldClass}
                                />
                            </label>
                        </CardContent>
                    </Card>

                    {has3D ? (
                        <Card>
                            <CardHeader>
                                <CardTitle>3D preview</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3 text-sm">
                                <div className="rounded-lg border border-dashed border-(--border) bg-[#080b10] p-3 text-(--muted)">
                                    Interactive 3D area placeholder (color, dimensions, texture controls).
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <label>
                                        <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-(--muted)">
                                            Color
                                        </span>
                                        <select
                                            className={fieldClass}
                                            value={threeDColor}
                                            onChange={(event) => setThreeDColor(event.target.value)}
                                        >
                                            <option>Natural</option>
                                            <option>Ivory</option>
                                            <option>Charcoal</option>
                                        </select>
                                    </label>
                                    <label>
                                        <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-(--muted)">
                                            Texture
                                        </span>
                                        <select
                                            className={fieldClass}
                                            value={threeDTexture}
                                            onChange={(event) => setThreeDTexture(event.target.value)}
                                        >
                                            <option>Polished</option>
                                            <option>Matte</option>
                                            <option>Brushed</option>
                                        </select>
                                    </label>
                                </div>
                            </CardContent>
                        </Card>
                    ) : null}

                    <div className="flex flex-wrap gap-3 pt-1">
                        <Button type="button" onClick={() => void handleAddToCart()} disabled={isSubmitting}>
                            Add to cart
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => void handleBuyNow()}
                            disabled={isSubmitting}
                        >
                            Buy now
                        </Button>
                    </div>
                </div>
            </div>

            {product.isPublished ? (
                <section className="space-y-4">
                    <Card>
                        <CardHeader>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--accent)">
                                Reviews
                            </p>
                            <CardTitle className="mt-1">What shoppers say</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 text-sm">
                            {canReview ? (
                                <div className="rounded-lg border border-(--border) bg-[#080b10] p-4">
                                    <p className="text-xs font-semibold uppercase tracking-wider text-(--muted)">
                                        Write a review
                                    </p>
                                    <div className="mt-2">
                                        <InteractiveStars value={ratingPick} onChange={setRatingPick} />
                                    </div>
                                    <Textarea
                                        className="mt-3 min-h-[88px] border-(--border) bg-[#050608] text-foreground"
                                        placeholder="Share what you liked or what could be better…"
                                        value={reviewBody}
                                        onChange={(e) => setReviewBody(e.target.value)}
                                    />
                                    <Button
                                        type="button"
                                        className="mt-3"
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
                                <p className="text-(--muted)">
                                    <Link href="/auth/login" className="font-semibold text-(--accent) underline-offset-4 hover:underline">
                                        Sign in as a shopper
                                    </Link>{" "}
                                    to leave a rating.
                                </p>
                            )}

                            <ul className="space-y-3">
                                {reviews.map((r) => (
                                    <li
                                        key={r.id}
                                        className="rounded-lg border border-(--border) bg-(--surface) p-4"
                                    >
                                        <div className="flex flex-wrap items-center gap-2">
                                            <StarRatingDisplay value={r.rating} />
                                            <span className="font-medium text-foreground">
                                                {r.authorLabel}
                                            </span>
                                            <span className="text-xs text-(--muted)">
                                                {new Date(r.createdAt).toLocaleDateString()}
                                            </span>
                                        </div>
                                        {r.body.trim() ? (
                                            <p className="mt-2 leading-relaxed text-(--muted)">{r.body}</p>
                                        ) : null}
                                    </li>
                                ))}
                            </ul>
                            {reviews.length === 0 ? (
                                <p className="text-(--muted)">No written reviews yet.</p>
                            ) : null}
                        </CardContent>
                    </Card>
                </section>
            ) : null}
        </main>
    );
}
