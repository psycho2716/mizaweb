import Link from "next/link";
import {
    LandingGuestAudienceSection,
    LandingGuestHeroSecondaryCta
} from "@/components/home/landing-guest-blocks";
import { cn, formatPeso, getAppName } from "@/lib/utils";
import { Box, Coins, ScanSearch } from "lucide-react";
import type { LandingHighlightsResponse } from "@/types";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

async function getHighlights(): Promise<LandingHighlightsResponse> {
    try {
        const response = await fetch(`${BACKEND_URL}/public/highlights`, { cache: "no-store" });
        if (!response.ok) {
            return { recommendedProducts: [], topSellers: [] };
        }
        return (await response.json()) as LandingHighlightsResponse;
    } catch {
        return { recommendedProducts: [], topSellers: [] };
    }
}

export default async function Home() {
    const highlights = await getHighlights();
    const featureCards = [
        {
            title: "Curated stone goods",
            description:
                "Sculptures, kitchen and dining pieces, décor, keychains, and gifts from verified sellers—clear listings and pricing.",
            icon: ScanSearch
        },
        {
            title: "Straightforward checkout",
            description:
                "Add to cart, pay cash or online where offered, then track orders and chat with the seller when you need an update.",
            icon: Coins
        },
        {
            title: "See pieces up close",
            description:
                "Photos and optional 3D-style previews help you judge texture, finish, and scale before you buy.",
            icon: Box
        }
    ] as const;

    return (
        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-14 px-4 pb-14 pt-6 sm:px-6 lg:gap-16 lg:pt-8">
            <section className="relative overflow-hidden rounded-2xl border border-(--border) bg-(--surface)">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_0%,rgba(34,199,243,0.16),transparent_34%),linear-gradient(120deg,#0a1018_20%,#0f1622_55%,#141c2a_100%)]" />
                <div className="absolute inset-0 bg-[linear-gradient(130deg,rgba(4,7,12,0.16)_30%,rgba(3,5,9,0.78)_70%)]" />
                <div className="relative flex min-h-[420px] flex-col justify-center px-6 py-12 md:min-h-[500px] md:px-12">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-(--accent)">
                        Stone lifestyle marketplace
                    </p>
                    <h1 className="mt-4 max-w-xl text-5xl leading-[0.95] font-semibold tracking-tight md:text-7xl">
                        {getAppName()}
                        <br />
                        <span className="text-(--accent)">STONE GOODS</span>
                    </h1>
                    <p className="mt-5 max-w-md text-sm leading-7 text-(--muted)">
                        Shop marble and stone sculptures, kitchen pieces, décor, accessories, and
                        gifts from Filipino artisans. Message sellers, and checkout in one place.
                    </p>
                    <div className="mt-8 flex flex-wrap gap-3">
                        <Link
                            href="/products"
                            className="rounded-sm bg-(--accent) px-5 py-2 text-xs font-semibold uppercase tracking-[0.13em] text-[#031018] transition hover:brightness-110"
                        >
                            Explore catalog
                        </Link>
                        <LandingGuestHeroSecondaryCta />
                    </div>
                </div>
            </section>

            <section id="features" className="space-y-6">
                <div className="flex items-end justify-between gap-4">
                    <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-(--accent)">
                            Features
                        </p>
                        <h2 className="mt-2 flex flex-wrap items-center gap-3 text-3xl font-semibold text-foreground">
                            <span>Why use {getAppName()}?</span>
                        </h2>
                    </div>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                    {featureCards.map((feature) => (
                        <article
                            key={feature.title}
                            className="rounded-sm border border-(--border) bg-(--surface) p-6 transition hover:border-(--accent)/50"
                        >
                            <div className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-(--accent)/45 bg-(--surface-elevated)">
                                <feature.icon className="h-4 w-4 text-(--accent)" aria-hidden />
                            </div>
                            <h3 className="mt-5 text-base font-semibold text-foreground">
                                {feature.title}
                            </h3>
                            <p className="mt-3 text-sm leading-7 text-(--muted)">
                                {feature.description}
                            </p>
                        </article>
                    ))}
                </div>
            </section>

            <section className="space-y-6">
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-(--accent)">
                            Products
                        </p>
                        <h2 className="mt-2 text-3xl font-semibold text-foreground">
                            Featured artworks
                        </h2>
                    </div>
                    <Link
                        href="/products"
                        className="text-xs font-semibold uppercase tracking-[0.14em] text-(--muted) hover:text-(--accent)"
                    >
                        Browse all
                    </Link>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                    {highlights.recommendedProducts.slice(0, 3).map((product, index) => (
                        <Link
                            key={product.id}
                            href={`/products/${product.id}`}
                            className="group overflow-hidden rounded-sm border border-(--border) bg-(--surface)"
                        >
                            <div
                                className={cn(
                                    "relative h-56 w-full overflow-hidden bg-(--surface-elevated)",
                                    !product.thumbnailUrl &&
                                        index === 0 &&
                                        "bg-[linear-gradient(145deg,#d7d9d7,#a5aba7,#e5e6e4)]",
                                    !product.thumbnailUrl &&
                                        index === 1 &&
                                        "bg-[linear-gradient(145deg,#070b12,#0f1722,#1b2530)]",
                                    !product.thumbnailUrl &&
                                        index === 2 &&
                                        "bg-[linear-gradient(145deg,#1e4d78,#355f89,#23496d)]"
                                )}
                            >
                                {product.thumbnailUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element -- remote seller/storage URLs; domains vary by env
                                    <img
                                        src={product.thumbnailUrl}
                                        alt=""
                                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                                    />
                                ) : null}
                            </div>
                            <div className="space-y-2 border-t border-(--border) bg-(--surface-elevated) p-4">
                                <p className="line-clamp-1 text-sm font-semibold text-foreground">
                                    {product.title}
                                </p>
                                <p className="line-clamp-2 text-xs text-(--muted)">
                                    {product.description ||
                                        "Hand-finished stone products from verified sellers."}
                                </p>
                                <p className="text-xs font-semibold text-(--accent)">
                                    {formatPeso(product.basePrice)}
                                </p>
                            </div>
                        </Link>
                    ))}
                    {highlights.recommendedProducts.length === 0 ? (
                        <div className="md:col-span-3 rounded-sm border border-dashed border-(--border) bg-(--surface) p-6 text-sm text-(--muted)">
                            Featured materials will appear once sellers publish listings.
                        </div>
                    ) : null}
                </div>
            </section>

            <LandingGuestAudienceSection />
        </main>
    );
}
