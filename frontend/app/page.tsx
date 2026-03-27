import Link from "next/link";
import { Box, Coins, Currency, CurrencyIcon, Landmark, ScanSearch } from "lucide-react";
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
            title: "Verified Stone Supply",
            description:
                "Source granite, marble, and specialty cuts from vetted sellers with transparent listing data.",
            icon: ScanSearch
        },
        {
            title: "Project-Ready Pricing",
            description:
                "Compare base prices quickly and shortlist materials that fit budget, finish, and volume targets.",
            icon: Coins
        },
        {
            title: "Interactive 3D Product Views",
            description:
                "Let customers inspect stone texture, edges, and scale with interactive 3D product previews before ordering.",
            icon: Box
        }
    ] as const;

    return (
        <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-14 px-4 pb-14 pt-6 sm:px-6 lg:gap-16 lg:pt-8">
            <section className="relative overflow-hidden rounded-2xl border border-(--border) bg-(--surface)">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_0%,rgba(34,199,243,0.16),transparent_34%),linear-gradient(120deg,#0a1018_20%,#0f1622_55%,#141c2a_100%)]" />
                <div className="absolute inset-0 bg-[linear-gradient(130deg,rgba(4,7,12,0.16)_30%,rgba(3,5,9,0.78)_70%)]" />
                <div className="relative flex min-h-[420px] flex-col justify-center px-6 py-12 md:min-h-[500px] md:px-12">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-(--muted)">
                        Stone sourcing network
                    </p>
                    <h1 className="mt-4 max-w-xl text-5xl leading-[0.95] font-semibold tracking-tight md:text-7xl">
                        <span className="text-foreground">MIZAWEB</span>
                        <br />
                        <span className="text-(--accent)">STONE MARKETPLACE</span>
                    </h1>
                    <p className="mt-5 max-w-md text-sm leading-7 text-(--muted)">
                        Curated natural stone listings for modern builds. Find verified suppliers,
                        compare catalog options, and move from inquiry to delivery in one platform.
                    </p>
                    <div className="mt-8 flex flex-wrap gap-3">
                        <Link
                            href="/products"
                            className="rounded-sm bg-(--accent) px-5 py-2 text-xs font-semibold uppercase tracking-[0.13em] text-[#031018] transition hover:brightness-110"
                        >
                            Explore catalog
                        </Link>
                        <Link
                            href="/auth/register"
                            className="rounded-sm border border-(--border) bg-black/20 px-5 py-2 text-xs font-semibold uppercase tracking-[0.13em] text-foreground transition hover:bg-(--surface-elevated)"
                        >
                            Start selling
                        </Link>
                    </div>
                </div>
            </section>

            <section id="features" className="space-y-6">
                <div className="flex items-end justify-between gap-4">
                    <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-(--accent)">
                            Features
                        </p>
                        <h2 className="mt-2 text-3xl font-semibold text-foreground">
                            Marketplace Features
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
                            Chapter 02
                        </p>
                        <h2 className="mt-2 text-3xl font-semibold text-foreground">
                            Featured Materials
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
                                className={[
                                    "h-56 w-full",
                                    index === 0 &&
                                        "bg-[linear-gradient(145deg,#d7d9d7,#a5aba7,#e5e6e4)]",
                                    index === 1 &&
                                        "bg-[linear-gradient(145deg,#070b12,#0f1722,#1b2530)]",
                                    index === 2 &&
                                        "bg-[linear-gradient(145deg,#1e4d78,#355f89,#23496d)]"
                                ]
                                    .filter(Boolean)
                                    .join(" ")}
                            />
                            <div className="space-y-2 border-t border-(--border) bg-(--surface-elevated) p-4">
                                <p className="line-clamp-1 text-sm font-semibold text-foreground">
                                    {product.title}
                                </p>
                                <p className="line-clamp-2 text-xs text-(--muted)">
                                    {product.description ||
                                        "Premium cut suitable for facade, flooring, and interior accents."}
                                </p>
                                <p className="text-xs font-semibold text-(--accent)">
                                    PHP {product.basePrice}
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

            <section className="grid gap-4 md:grid-cols-2">
                <article className="rounded-sm border border-(--border) bg-(--surface) p-8">
                    <h3 className="text-3xl font-semibold text-foreground">For Buyers</h3>
                    <p className="mt-3 max-w-sm text-sm leading-7 text-(--muted)">
                        Create a sourcing shortlist, compare stone options by budget and quality,
                        and order from verified merchants.
                    </p>
                    <Link
                        href="/products"
                        className="mt-5 inline-block text-xs font-semibold uppercase tracking-[0.14em] text-(--accent)"
                    >
                        Explore products →
                    </Link>
                </article>
                <article className="rounded-sm border border-(--border) bg-(--surface) p-8">
                    <h3 className="text-3xl font-semibold text-foreground">For Sellers</h3>
                    <p className="mt-3 max-w-sm text-sm leading-7 text-(--muted)">
                        Publish catalog items, receive buyer inquiries, and manage orders through a
                        dedicated seller workflow.
                    </p>
                    <Link
                        href="/auth/register"
                        className="mt-5 inline-block text-xs font-semibold uppercase tracking-[0.14em] text-(--accent)"
                    >
                        Create seller account →
                    </Link>
                </article>
            </section>
        </main>
    );
}
