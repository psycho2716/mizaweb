"use client";

import Link from "next/link";
import { MapPin, Package, Shield, Star } from "lucide-react";
import { AdminSellerLocationMap } from "@/components/admin/admin-seller-location-map";
import { cn } from "@/lib/utils";
import type { SellerStorefrontPublicViewProps } from "@/types";

function verificationLabel(status: string): string {
    switch (status) {
        case "approved":
            return "Verified seller";
        case "pending":
            return "Verification pending";
        case "rejected":
            return "Verification required";
        default:
            return "Unverified";
    }
}

export function SellerStorefrontPublicView({ profile }: SellerStorefrontPublicViewProps) {
    const reviewCount = profile.reviewCount ?? 0;
    const avgRating = profile.averageRating ?? null;
    return (
        <main className="min-h-screen flex-1 bg-[#030406] text-foreground">
            <div
                className="relative border-b border-white/[0.06] bg-[#0b0e14]"
                style={
                    profile.storeBackgroundUrl
                        ? {
                              backgroundImage: `linear-gradient(180deg, rgba(3,4,6,0.5) 0%, rgba(3,4,6,0.92) 100%), url(${profile.storeBackgroundUrl})`,
                              backgroundSize: "cover",
                              backgroundPosition: "center"
                          }
                        : undefined
                }
            >
                <div className="mx-auto max-w-5xl px-4 pb-12 pt-10 sm:px-6 lg:pb-16 lg:pt-14">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-(--accent)">
                        Public shop page
                    </p>
                    <div className="mt-6 flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
                        <div className="flex min-w-0 flex-1 flex-col gap-5 sm:flex-row sm:items-end sm:gap-6">
                            <div
                                className={cn(
                                    "relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl border-2 border-white/15 bg-[#12151c] shadow-[0_0_40px_rgba(0,0,0,0.5)] ring-2 ring-(--accent)/20 sm:h-28 sm:w-28"
                                )}
                            >
                                {profile.profileImageUrl ? (
                                    <img
                                        src={profile.profileImageUrl}
                                        alt=""
                                        className="h-full w-full object-cover"
                                    />
                                ) : (
                                    <div className="flex h-full w-full items-center justify-center text-xl font-bold text-(--accent)">
                                        {profile.businessName.slice(0, 2).toUpperCase()}
                                    </div>
                                )}
                            </div>
                            <div className="min-w-0">
                                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
                                    {profile.businessName}
                                </h1>
                                <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-(--muted)">
                                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/30 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider text-foreground backdrop-blur-sm">
                                        <Shield className="h-3.5 w-3.5 text-(--accent)" aria-hidden />
                                        {verificationLabel(profile.verificationStatus)}
                                    </span>
                                </p>
                            </div>
                        </div>
                        <Link
                            href="/products"
                            className="inline-flex shrink-0 items-center justify-center rounded-lg border border-(--accent)/40 bg-(--accent)/10 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-(--accent) transition hover:bg-(--accent)/20"
                        >
                            Browse marketplace
                        </Link>
                    </div>

                    <div className="mt-10 grid gap-3 sm:grid-cols-3">
                        <div className="rounded-xl border border-white/10 bg-black/35 px-4 py-3 backdrop-blur-md">
                            <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-(--muted)">
                                <Package className="h-3.5 w-3.5 text-(--accent)" aria-hidden />
                                Live listings
                            </p>
                            <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                                {profile.publishedProducts}
                            </p>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-black/35 px-4 py-3 backdrop-blur-md">
                            <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-(--muted)">
                                <Star className="h-3.5 w-3.5 text-amber-400" aria-hidden />
                                Shop rating
                            </p>
                            <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                                {reviewCount > 0 && avgRating != null ? avgRating.toFixed(1) : "—"}
                            </p>
                            <p className="text-[10px] text-(--muted)">
                                {reviewCount} {reviewCount === 1 ? "review" : "reviews"} across products
                            </p>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-black/35 px-4 py-3 backdrop-blur-md">
                            <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-(--muted)">
                                <MapPin className="h-3.5 w-3.5 text-(--accent)" aria-hidden />
                                Location
                            </p>
                            <p className="mt-1 line-clamp-2 text-sm text-foreground">{profile.address}</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:py-12">
                <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr] lg:gap-10">
                    <section className="rounded-2xl border border-white/10 bg-[#0b0e14] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                        <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground">
                            Contact
                        </h2>
                        <dl className="mt-5 space-y-4 text-sm">
                            <div>
                                <dt className="text-[10px] font-semibold uppercase tracking-wider text-(--muted)">
                                    Email
                                </dt>
                                <dd className="mt-1 break-all text-foreground">{profile.email}</dd>
                            </div>
                            <div>
                                <dt className="text-[10px] font-semibold uppercase tracking-wider text-(--muted)">
                                    Phone
                                </dt>
                                <dd className="mt-1 text-foreground">{profile.contactNumber}</dd>
                            </div>
                            <div>
                                <dt className="text-[10px] font-semibold uppercase tracking-wider text-(--muted)">
                                    Address
                                </dt>
                                <dd className="mt-1 leading-relaxed text-(--muted)">{profile.address}</dd>
                            </div>
                        </dl>
                    </section>

                    <section className="rounded-2xl border border-(--accent)/20 bg-[#0b0e14] p-6 shadow-[0_0_40px_rgba(34,199,243,0.08)]">
                        <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground">
                            Shop on the map
                        </h2>
                        <p className="mt-1 text-xs text-(--muted)">
                            Shows where the seller placed their shop pin (for example a showroom or office).
                        </p>
                        <div className="mt-5">
                            <AdminSellerLocationMap
                                latitude={profile.shopLatitude}
                                longitude={profile.shopLongitude}
                                address={profile.address}
                                showSectionLabel={false}
                                mapFrameClassName="relative z-0 h-56 w-full overflow-hidden rounded-xl border border-(--accent)/25 sm:h-64"
                            />
                        </div>
                    </section>
                </div>
            </div>
        </main>
    );
}
