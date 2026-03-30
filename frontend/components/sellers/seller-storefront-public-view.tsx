"use client";

import Link from "next/link";
import { ArrowRight, BadgeCheck, ChevronRight, Globe2, MapPin, Package, Star } from "lucide-react";
import { AdminSellerLocationMap } from "@/components/admin/admin-seller-location-map";
import { cn, formatPeso, getAppName } from "@/lib/utils";
import type { Product } from "@/types";
import type { SellerStorefrontPublicViewProps } from "@/types";

function verificationHeadline(status: string): string {
    switch (status) {
        case "approved":
            return "Verified by Mizaweb";
        case "pending":
            return "We’re still checking this shop";
        case "rejected":
            return "Not verified yet";
        default:
            return "Verification not shown";
    }
}

function splitBusinessHeadline(name: string): { lead: string; accent: string } {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
        return {
            lead: parts.slice(0, -1).join(" "),
            accent: `${parts[parts.length - 1]}.`
        };
    }
    return { lead: "Stone pieces ·", accent: `${parts[0] ?? "Shop"}.` };
}

function ProductCard({
    product,
    className,
    featured
}: {
    product: Product;
    className?: string;
    featured?: boolean;
}) {
    return (
        <Link
            href={`/products/${product.id}`}
            className={cn(
                "group relative block overflow-hidden bg-[#0a0c10] transition duration-300 hover:ring-1 hover:ring-(--accent)/40",
                featured ? "min-h-[min(72vw,520px)] md:min-h-[480px]" : "aspect-square",
                className
            )}
        >
            <div
                className={cn(
                    "absolute inset-0 bg-[linear-gradient(180deg,transparent_40%,rgba(0,0,0,0.85)_100%)]",
                    "opacity-90 transition group-hover:opacity-100"
                )}
            />
            {product.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- remote seller URLs
                <img
                    src={product.thumbnailUrl}
                    alt=""
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                />
            ) : (
                <div
                    className={cn(
                        "flex h-full w-full items-center justify-center bg-[linear-gradient(145deg,#1a1f2a,#0d1018)]",
                        "text-sm font-semibold uppercase tracking-widest text-(--muted)"
                    )}
                >
                    No image
                </div>
            )}
            <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6">
                {product.isFeatured ? (
                    <p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.2em] text-(--accent)">
                        Featured
                    </p>
                ) : null}
                <p
                    className={cn(
                        "font-semibold tracking-tight text-foreground",
                        featured ? "text-xl sm:text-2xl" : "text-sm sm:text-base"
                    )}
                >
                    {product.title}
                </p>
                <p className="mt-1 text-xs font-medium text-(--accent)">
                    {formatPeso(product.basePrice)}
                </p>
            </div>
        </Link>
    );
}

export function SellerStorefrontPublicView({ profile }: SellerStorefrontPublicViewProps) {
    const appName = getAppName();
    const products = profile.storefrontProducts ?? [];
    const { lead, accent } = splitBusinessHeadline(profile.businessName);
    const reviewCount = profile.reviewCount ?? 0;
    const avgRating = profile.averageRating ?? null;
    const sellerQuery = `/products?seller=${encodeURIComponent(profile.sellerId)}`;
    /** Full-bleed hero uses the seller’s shop cover only (set in seller profile). */
    const heroBackgroundUrl = profile.storeBackgroundUrl ?? null;

    return (
        <main className="flex-1 bg-[#050508] text-foreground">
            <section
                className="relative flex min-h-[min(72vh,620px)] items-center overflow-hidden border-b border-white/10 sm:min-h-[min(78vh,720px)]"
                aria-label="Shop introduction"
            >
                {heroBackgroundUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- remote seller URLs
                    <img
                        src={heroBackgroundUrl}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover object-center"
                    />
                ) : (
                    <div
                        className="absolute inset-0 bg-[#030406] bg-[radial-gradient(ellipse_80%_60%_at_70%_-10%,rgba(34,199,243,0.12),transparent)]"
                        aria-hidden
                    />
                )}
                {/* Readability: strong scrim on the left (headline zone), lighter toward the right */}
                <div
                    className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(3,4,6,0.92)_0%,rgba(3,4,6,0.78)_38%,rgba(3,4,6,0.35)_65%,rgba(3,4,6,0.2)_100%)] sm:bg-[linear-gradient(90deg,rgba(3,4,6,0.94)_0%,rgba(3,4,6,0.72)_42%,rgba(3,4,6,0.25)_72%,transparent_100%)]"
                    aria-hidden
                />
                <div
                    className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(3,4,6,0.55)_0%,transparent_35%,transparent_65%,rgba(3,4,6,0.75)_100%)] sm:bg-[linear-gradient(180deg,rgba(3,4,6,0.4)_0%,transparent_40%,transparent_70%,rgba(3,4,6,0.5)_100%)]"
                    aria-hidden
                />
                <div className="relative z-10 mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
                    <div className="max-w-xl">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-(--accent) drop-shadow-[0_1px_12px_rgba(0,0,0,0.8)]">
                            {profile.businessName}
                        </p>
                        <h1 className="mt-5 text-4xl font-bold leading-[1.02] tracking-tight drop-shadow-[0_2px_24px_rgba(0,0,0,0.85)] sm:text-5xl lg:text-[3.25rem]">
                            <span className="text-foreground">{lead}</span>
                            <br />
                            <span className="text-(--accent)">{accent}</span>
                        </h1>
                        <p className="mt-6 text-sm leading-relaxed text-foreground/90 drop-shadow-[0_1px_16px_rgba(0,0,0,0.9)] sm:text-base">
                            Explore unique, hand-crafted home décor and gifts. Tap any product to
                            chat with this shop and complete your order securely on {appName}.
                        </p>
                        {!heroBackgroundUrl ? (
                            <p className="mt-4 flex items-center gap-2 text-sm text-(--muted)">
                                <Globe2
                                    className="h-4 w-4 shrink-0 text-(--accent)/60"
                                    aria-hidden
                                />
                                This shop hasn’t added a cover photo yet.
                            </p>
                        ) : null}
                        <div className="mt-8 flex flex-wrap gap-3">
                            <a
                                href="#collection"
                                className="inline-flex min-h-11 items-center justify-center bg-(--accent) px-7 text-xs font-bold uppercase tracking-[0.16em] text-[#030608] transition hover:brightness-110"
                            >
                                See products
                            </a>
                            <Link
                                href={`/buyer/messages?seller=${encodeURIComponent(profile.sellerId)}`}
                                className="inline-flex min-h-11 items-center gap-2 border border-white/35 bg-black/20 px-6 text-xs font-bold uppercase tracking-[0.16em] text-foreground backdrop-blur-[2px] transition hover:border-(--accent)/50 hover:bg-black/30 hover:text-(--accent)"
                            >
                                Message shop
                                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            <section className="border-b border-white/10 bg-[#050508]" aria-label="About this shop">
                <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:gap-6 lg:px-8 lg:py-12">
                    <div className="flex gap-3">
                        <BadgeCheck
                            className={cn(
                                "mt-0.5 h-5 w-5 shrink-0",
                                profile.verificationStatus === "approved"
                                    ? "text-(--accent)"
                                    : "text-(--muted)"
                            )}
                            aria-hidden
                        />
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--muted)">
                                Trust
                            </p>
                            <p className="mt-1 text-sm font-semibold text-foreground">
                                {verificationHeadline(profile.verificationStatus)}
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <Package className="mt-0.5 h-5 w-5 shrink-0 text-(--accent)" aria-hidden />
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--muted)">
                                For sale
                            </p>
                            <p className="mt-1 text-sm font-semibold text-foreground">
                                {profile.publishedProducts} product
                                {profile.publishedProducts === 1 ? "" : "s"} on {appName}
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <Star className="mt-0.5 h-5 w-5 shrink-0 text-(--accent)" aria-hidden />
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--muted)">
                                Buyer reviews
                            </p>
                            <p className="mt-1 text-sm font-semibold text-foreground">
                                {reviewCount > 0 && avgRating != null ? avgRating.toFixed(1) : "—"}{" "}
                                / 5
                            </p>
                            <p className="text-xs text-(--muted)">
                                {reviewCount === 0
                                    ? "No reviews yet"
                                    : `${reviewCount} ${reviewCount === 1 ? "review" : "reviews"} so far`}
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-(--accent)" aria-hidden />
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--muted)">
                                Location
                            </p>
                            <p className="mt-1 line-clamp-3 text-sm font-medium leading-snug text-foreground">
                                {profile.address}
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            <section
                id="collection"
                className="scroll-mt-28 border-b border-white/10 bg-[#030406] py-14 sm:py-16 lg:py-20"
            >
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                    <div className="flex flex-wrap items-end justify-between gap-4">
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-(--accent)">
                                Collection
                            </p>
                            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
                                Masterpiece selection
                            </h2>
                        </div>
                        <Link
                            href={sellerQuery}
                            className="group inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-(--muted) transition hover:text-(--accent)"
                        >
                            View entire archive
                            <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                        </Link>
                    </div>

                    {products.length === 0 ? (
                        <div className="mt-10 border border-dashed border-white/15 bg-[#080a0e] px-6 py-16 text-center">
                            <p className="text-sm text-(--muted)">No products here yet.</p>
                            <Link
                                href="/products"
                                className="mt-4 inline-block text-xs font-semibold uppercase tracking-wider text-(--accent) underline-offset-4 hover:underline"
                            >
                                Browse {appName}
                            </Link>
                        </div>
                    ) : (
                        <div className="mt-10 space-y-4">
                            <div className="grid gap-4 md:grid-cols-3 md:grid-rows-2 md:gap-3">
                                <ProductCard
                                    product={products[0]}
                                    featured
                                    className="md:col-span-2 md:row-span-2"
                                />
                                {products[1] ? (
                                    <ProductCard
                                        product={products[1]}
                                        className="md:col-span-1 md:row-span-1"
                                    />
                                ) : (
                                    <div className="hidden md:block md:col-span-1" aria-hidden />
                                )}
                                {products[2] ? (
                                    <ProductCard
                                        product={products[2]}
                                        className="md:col-span-1 md:row-span-1"
                                    />
                                ) : null}
                            </div>
                            {products.length > 3 ? (
                                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                                    {products.slice(3).map((p) => (
                                        <ProductCard key={p.id} product={p} />
                                    ))}
                                </div>
                            ) : null}
                        </div>
                    )}
                </div>
            </section>

            <section
                id="logistics"
                className="scroll-mt-28 border-b border-white/10 bg-[#050508] py-14 sm:py-16 lg:py-20"
            >
                <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:items-center lg:gap-16 lg:px-8">
                    <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-(--accent)">
                            Store Location
                        </p>
                        <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
                            Pin drops, handoffs, and local trust
                        </h2>
                        <p className="mt-4 text-sm leading-relaxed text-(--muted) sm:text-base">
                            This map reflects where the seller pinned their shop—use it to orient
                            pickups, meetups, or regional context. Final delivery terms are
                            confirmed per order in Mizaweb checkout and chat.
                        </p>
                    </div>
                    <div className="relative overflow-hidden border border-white/10 bg-[#080a0e] p-1 shadow-[0_0_50px_-18px_rgba(34,199,243,0.2)]">
                        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(34,199,243,0.08),transparent_50%)]" />
                        <AdminSellerLocationMap
                            latitude={profile.shopLatitude}
                            longitude={profile.shopLongitude}
                            address={profile.address}
                            showSectionLabel={false}
                            mapFrameClassName="relative z-0 h-64 w-full overflow-hidden sm:h-80"
                        />
                    </div>
                </div>
            </section>

            <section
                id="contact"
                className="scroll-mt-28 border-t border-white/10 bg-[#050508] py-14 sm:py-16"
            >
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-(--accent)">
                        Contact Details
                    </p>
                    <h2 className="mt-2 text-xl font-bold tracking-tight sm:text-2xl">
                        Direct Orders and Messages
                    </h2>
                    <dl className="mt-8 grid gap-8 sm:grid-cols-3">
                        <div>
                            <dt className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--muted)">
                                Email
                            </dt>
                            <dd className="mt-2 break-all text-sm text-foreground">
                                {profile.email}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--muted)">
                                Phone
                            </dt>
                            <dd className="mt-2 text-sm text-foreground">
                                {profile.contactNumber}
                            </dd>
                        </div>
                        <div className="sm:col-span-1">
                            <dt className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--muted)">
                                Address
                            </dt>
                            <dd className="mt-2 text-sm leading-relaxed text-(--muted)">
                                {profile.address}
                            </dd>
                        </div>
                    </dl>
                </div>
            </section>
        </main>
    );
}
