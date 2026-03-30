"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { cn, formatPeso, getAppName } from "@/lib/utils";
import type { Product } from "@/types";
import type { ProductsListingClientProps } from "@/types/ui";

const PAGE_SIZE = 9;

type SortMode = "featured" | "price-asc" | "price-desc" | "name";

const CATALOG_SORT_OPTIONS: { value: SortMode; label: string }[] = [
    { value: "featured", label: "Featured" },
    { value: "price-asc", label: "Price: Low to high" },
    { value: "price-desc", label: "Price: High to low" },
    { value: "name", label: "Name A–Z" }
];

/** Matches listing data: sellers set stock vs made-to-order in the dashboard. */
type AvailabilityFilter = "all" | "in-stock" | "made-to-order";

function isFeaturedProduct(p: Product): boolean {
    return Boolean(p.isFeatured);
}

function isMadeToOrder(p: Product): boolean {
    return Boolean(p.madeToOrder);
}

function stockCount(p: Product): number {
    return typeof p.stockQuantity === "number" ? p.stockQuantity : 0;
}

/** In-stock = not MTO and has at least one unit (seller-tracked). */
function hasBuyableStock(p: Product): boolean {
    if (isMadeToOrder(p)) {
        return false;
    }
    return stockCount(p) > 0;
}

function sortProducts(list: Product[], sort: SortMode): Product[] {
    const next = [...list];
    switch (sort) {
        case "featured":
            return next.sort((a, b) => {
                const af = isFeaturedProduct(a) ? 1 : 0;
                const bf = isFeaturedProduct(b) ? 1 : 0;
                if (bf !== af) {
                    return bf - af;
                }
                return a.title.localeCompare(b.title);
            });
        case "price-asc":
            return next.sort((a, b) => a.basePrice - b.basePrice);
        case "price-desc":
            return next.sort((a, b) => b.basePrice - a.basePrice);
        case "name":
            return next.sort((a, b) => a.title.localeCompare(b.title));
        default:
            return next;
    }
}

/** Parse filter input; commas allowed; empty = use bound default in caller. */
function parsePesoFilterInput(raw: string): number | null {
    const t = raw.trim().replace(/,/g, "");
    if (t === "") {
        return null;
    }
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0) {
        return null;
    }
    return Math.floor(n);
}

function catalogPriceBounds(products: Product[]): { min: number; max: number } {
    if (products.length === 0) {
        return { min: 0, max: 0 };
    }
    const prices = products.map((p) => Number(p.basePrice)).filter((n) => Number.isFinite(n));
    if (prices.length === 0) {
        return { min: 0, max: 0 };
    }
    return { min: Math.min(...prices), max: Math.max(...prices) };
}

/** Clamp parsed min/max to catalog bounds and order; used for blur sync and filter math. */
function clampPricePairToCatalog(
    rawMin: string,
    rawMax: string,
    bounds: { min: number; max: number }
): { lo: number; hi: number; minStr: string; maxStr: string } {
    const parsedMin = parsePesoFilterInput(rawMin);
    const parsedMax = parsePesoFilterInput(rawMax);
    let lo = parsedMin ?? bounds.min;
    let hi = parsedMax ?? bounds.max;
    lo = Math.max(bounds.min, Math.min(bounds.max, lo));
    hi = Math.max(bounds.min, Math.min(bounds.max, hi));
    if (lo > hi) {
        [lo, hi] = [hi, lo];
    }
    return { lo, hi, minStr: String(lo), maxStr: String(hi) };
}

function visiblePageNumbers(current: number, total: number): number[] {
    if (total <= 7) {
        return Array.from({ length: total }, (_, i) => i + 1);
    }
    const set = new Set<number>([1, total, current, current - 1, current + 1]);
    for (const n of [...set]) {
        if (n < 1 || n > total) {
            set.delete(n);
        }
    }
    return [...set].sort((a, b) => a - b);
}

const fieldClass =
    "h-10 w-full rounded-lg border border-(--border) bg-[#080b10] px-3 text-sm text-foreground placeholder:text-(--muted) focus-visible:border-(--accent)/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/25";

const selectClass =
    "h-10 w-full min-w-0 cursor-pointer rounded-lg border border-(--border) bg-[#080b10] px-3 text-xs font-semibold uppercase tracking-wider text-foreground focus-visible:border-(--accent)/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/25";

type CatalogResultsProps = {
    sorted: Product[];
    initialProductsLength: number;
    filteredLength: number;
    hasActiveFilters: boolean;
    clearAllFilters: () => void;
};

function CatalogResults({
    sorted,
    initialProductsLength,
    filteredLength,
    hasActiveFilters,
    clearAllFilters
}: CatalogResultsProps) {
    const [page, setPage] = useState(1);
    const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
    const safePage = Math.min(Math.max(1, page), totalPages);

    const pageItems = useMemo(() => {
        const start = (safePage - 1) * PAGE_SIZE;
        return sorted.slice(start, start + PAGE_SIZE);
    }, [sorted, safePage]);

    const pages = useMemo(() => visiblePageNumbers(safePage, totalPages), [safePage, totalPages]);

    return (
        <>
            <p className="mb-6 text-xs text-(--muted)">
                {sorted.length} {sorted.length === 1 ? "listing" : "listings"}
                {filteredLength !== initialProductsLength
                    ? ` (of ${initialProductsLength} published)`
                    : null}
            </p>

            {pageItems.length === 0 ? (
                <div className="rounded-2xl border border-(--border) bg-[#080b10]/60 py-16 text-center">
                    <p className="text-lg font-semibold text-foreground">No matches</p>
                    <p className="mt-2 text-sm text-(--muted)">Try adjusting filters or search.</p>
                    {hasActiveFilters ? (
                        <button
                            type="button"
                            onClick={clearAllFilters}
                            className="mt-4 text-sm font-semibold text-(--accent) underline-offset-4 hover:underline"
                        >
                            Clear all filters
                        </button>
                    ) : null}
                </div>
            ) : (
                <ul className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                    {pageItems.map((product) => (
                        <li key={product.id}>
                            <Link
                                href={`/products/${product.id}`}
                                className="group block h-full rounded-2xl border border-white/8 bg-[#080b10]/90 shadow-[0_0_0_1px_rgba(255,255,255,0.04)] transition-all duration-300 hover:border-(--accent)/35 hover:shadow-[0_0_36px_-12px_var(--accent)]"
                            >
                                <div className="relative aspect-4/3 overflow-hidden rounded-t-2xl bg-[#050608]">
                                    {product.thumbnailUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element -- remote seller URLs
                                        <img
                                            src={product.thumbnailUrl}
                                            alt=""
                                            className="h-full w-full object-cover transition duration-500 ease-out group-hover:scale-[1.04]"
                                        />
                                    ) : (
                                        <div className="flex h-full w-full items-center justify-center bg-linear-to-br from-zinc-800 via-[#0c1018] to-zinc-950">
                                            <span className="text-5xl font-light tabular-nums text-zinc-700">
                                                {product.title.slice(0, 1).toUpperCase()}
                                            </span>
                                        </div>
                                    )}
                                    <div className="absolute inset-x-0 top-0 flex flex-wrap items-start justify-end gap-2 p-3">
                                        {isFeaturedProduct(product) ? (
                                            <span className="rounded-full border border-(--accent)/40 bg-(--accent)/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-(--accent) backdrop-blur-md">
                                                Featured
                                            </span>
                                        ) : null}
                                    </div>
                                </div>
                                <div className="space-y-2 p-4">
                                    <h2 className="line-clamp-2 text-base font-bold leading-snug text-foreground group-hover:text-(--accent)">
                                        {product.title}
                                    </h2>
                                    <p className="text-xl font-bold tabular-nums text-(--accent)">
                                        {formatPeso(product.basePrice)}
                                    </p>
                                    <p className="text-right text-[10px] font-medium uppercase tracking-wider text-(--muted)">
                                        {isMadeToOrder(product)
                                            ? "Made to order"
                                            : typeof product.stockQuantity === "number"
                                              ? `${product.stockQuantity} in stock`
                                              : "View details"}
                                    </p>
                                </div>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}

            {totalPages > 1 ? (
                <nav
                    className="mt-10 flex flex-wrap items-center justify-center gap-2 border-t border-(--border)/60 pt-8"
                    aria-label="Pagination"
                >
                    <button
                        type="button"
                        onClick={() => setPage(Math.max(1, safePage - 1))}
                        disabled={safePage <= 1}
                        className="inline-flex items-center gap-1 rounded-lg border border-(--border) bg-[#080b10] px-3 py-2 text-xs font-semibold uppercase tracking-wider text-foreground transition-colors hover:border-(--accent)/40 disabled:pointer-events-none disabled:opacity-35"
                    >
                        <ChevronLeft className="h-4 w-4" aria-hidden />
                        Previous
                    </button>
                    <div className="flex flex-wrap items-center gap-1">
                        {pages.map((pNum, idx) => (
                            <Fragment key={pNum}>
                                {idx > 0 && pages[idx - 1] < pNum - 1 ? (
                                    <span className="px-2 text-(--muted)" aria-hidden>
                                        …
                                    </span>
                                ) : null}
                                <button
                                    type="button"
                                    onClick={() => setPage(pNum)}
                                    className={cn(
                                        "min-w-10 rounded-lg border px-3 py-2 text-xs font-bold tabular-nums transition-colors",
                                        pNum === safePage
                                            ? "border-(--accent) bg-(--accent)/15 text-(--accent) shadow-[0_0_16px_-4px_var(--accent)]"
                                            : "border-(--border) bg-[#080b10] text-(--muted) hover:border-(--accent)/30 hover:text-foreground"
                                    )}
                                    aria-current={pNum === safePage ? "page" : undefined}
                                >
                                    {String(pNum).padStart(2, "0")}
                                </button>
                            </Fragment>
                        ))}
                    </div>
                    <button
                        type="button"
                        onClick={() => setPage(Math.min(totalPages, safePage + 1))}
                        disabled={safePage >= totalPages}
                        className="inline-flex items-center gap-1 rounded-lg border border-(--border) bg-[#080b10] px-3 py-2 text-xs font-semibold uppercase tracking-wider text-foreground transition-colors hover:border-(--accent)/40 disabled:pointer-events-none disabled:opacity-35"
                    >
                        Next
                        <ChevronRight className="h-4 w-4" aria-hidden />
                    </button>
                </nav>
            ) : null}
        </>
    );
}

export function ProductsListingClient({ initialProducts }: ProductsListingClientProps) {
    const [sortBy, setSortBy] = useState<SortMode>("featured");
    const [search, setSearch] = useState("");
    const [featuredOnly, setFeaturedOnly] = useState(false);
    const [availability, setAvailability] = useState<AvailabilityFilter>("all");
    const [priceMinInput, setPriceMinInput] = useState(() => {
        if (initialProducts.length === 0) {
            return "";
        }
        const { min } = catalogPriceBounds(initialProducts);
        return String(min);
    });
    const [priceMaxInput, setPriceMaxInput] = useState(() => {
        if (initialProducts.length === 0) {
            return "";
        }
        const { max } = catalogPriceBounds(initialProducts);
        return String(max);
    });

    const priceBounds = useMemo(() => catalogPriceBounds(initialProducts), [initialProducts]);

    /** When the catalog set changes (e.g. seller filter), reset price inputs to full range. */
    const catalogIdentityKey = useMemo(
        () => initialProducts.map((p) => p.id).sort().join(","),
        [initialProducts]
    );

    useEffect(() => {
        if (initialProducts.length === 0) {
            setPriceMinInput("");
            setPriceMaxInput("");
            return;
        }
        const { min, max } = catalogPriceBounds(initialProducts);
        setPriceMinInput(String(min));
        setPriceMaxInput(String(max));
        // eslint-disable-next-line react-hooks/exhaustive-deps -- only reset when listing ids change; initialProducts matches that render
    }, [catalogIdentityKey]);

    const syncPriceInputsOnBlur = useCallback(() => {
        if (initialProducts.length === 0) {
            return;
        }
        const { minStr, maxStr } = clampPricePairToCatalog(
            priceMinInput,
            priceMaxInput,
            priceBounds
        );
        setPriceMinInput(minStr);
        setPriceMaxInput(maxStr);
    }, [initialProducts.length, priceMinInput, priceMaxInput, priceBounds]);

    const priceFilterRange = useMemo(() => {
        if (initialProducts.length === 0) {
            return { lo: 0, hi: 0 };
        }
        const { lo, hi } = clampPricePairToCatalog(
            priceMinInput,
            priceMaxInput,
            priceBounds
        );
        return { lo, hi };
    }, [initialProducts.length, priceMinInput, priceMaxInput, priceBounds]);

    const filterSignature = useMemo(
        () =>
            [
                search.trim(),
                featuredOnly ? "1" : "0",
                availability,
                priceFilterRange.lo,
                priceFilterRange.hi
            ].join("|"),
        [search, featuredOnly, availability, priceFilterRange.lo, priceFilterRange.hi]
    );

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        const { lo, hi } = priceFilterRange;

        return initialProducts.filter((p) => {
            if (q) {
                const blob = `${p.title} ${p.description}`.toLowerCase();
                if (!blob.includes(q)) {
                    return false;
                }
            }
            if (p.basePrice < lo || p.basePrice > hi) {
                return false;
            }
            if (featuredOnly && !isFeaturedProduct(p)) {
                return false;
            }
            if (availability === "in-stock" && !hasBuyableStock(p)) {
                return false;
            }
            if (availability === "made-to-order" && !isMadeToOrder(p)) {
                return false;
            }
            return true;
        });
    }, [initialProducts, search, priceFilterRange, featuredOnly, availability]);

    const sorted = useMemo(() => sortProducts(filtered, sortBy), [filtered, sortBy]);

    const clearAllFilters = useCallback(() => {
        setSearch("");
        setFeaturedOnly(false);
        setAvailability("all");
        if (initialProducts.length > 0) {
            setPriceMinInput(String(priceBounds.min));
            setPriceMaxInput(String(priceBounds.max));
        } else {
            setPriceMinInput("");
            setPriceMaxInput("");
        }
    }, [initialProducts.length, priceBounds.min, priceBounds.max]);

    const hasActiveFilters = useMemo(() => {
        if (initialProducts.length === 0) {
            return false;
        }
        const priceAtFullRange =
            priceFilterRange.lo === priceBounds.min && priceFilterRange.hi === priceBounds.max;
        return search.trim() !== "" || featuredOnly || availability !== "all" || !priceAtFullRange;
    }, [
        initialProducts.length,
        search,
        featuredOnly,
        availability,
        priceFilterRange.lo,
        priceFilterRange.hi,
        priceBounds.min,
        priceBounds.max
    ]);

    const sortLabel =
        CATALOG_SORT_OPTIONS.find((o) => o.value === sortBy)?.label ??
        CATALOG_SORT_OPTIONS[0].label;

    const appName = getAppName();

    return (
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:py-12">
            <nav className="mb-6 flex flex-wrap items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-(--muted)">
                <Link href="/" className="transition-colors hover:text-(--accent)">
                    Home
                </Link>
                <span className="opacity-40" aria-hidden>
                    /
                </span>
                <span className="text-foreground/90">Shop</span>
                <span className="opacity-40" aria-hidden>
                    /
                </span>
                <span className="text-foreground/90">All listings</span>
            </nav>

            <div className="lg:grid lg:grid-cols-[minmax(0,17.5rem)_minmax(0,1fr)] lg:gap-12 xl:grid-cols-[minmax(0,19rem)_minmax(0,1fr)]">
                <aside className="mb-10 space-y-8 lg:mb-0">
                    <div className="rounded-2xl border border-cyan-500/15 bg-[#080b10]/80 p-5 shadow-[0_0_40px_-20px_var(--accent)] backdrop-blur-sm">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-(--accent)">
                            Refine
                        </p>
                        <h2 className="mt-1 text-sm font-semibold text-foreground">Filters</h2>

                        <div className="mt-6 space-y-2">
                            <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-(--muted)">
                                Search
                            </label>
                            <div className="relative">
                                <Search
                                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--muted)"
                                    aria-hidden
                                />
                                <input
                                    type="search"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Title or description…"
                                    className={cn(fieldClass, "pl-9")}
                                    aria-label="Search listings"
                                />
                            </div>
                        </div>

                        <div className="mt-8 space-y-3">
                            <label
                                htmlFor="catalog-availability"
                                className="text-[10px] font-semibold uppercase tracking-[0.18em] text-(--muted)"
                            >
                                Availability
                            </label>
                            <p className="text-[11px] leading-snug text-(--muted)/90">
                                Based on how the seller listed the item (stock vs made to order).
                            </p>
                            <select
                                id="catalog-availability"
                                value={availability}
                                onChange={(e) =>
                                    setAvailability(e.target.value as AvailabilityFilter)
                                }
                                className={selectClass}
                                aria-label="Filter by availability"
                            >
                                <option value="all">All listings</option>
                                <option value="in-stock">In stock</option>
                                <option value="made-to-order">Made to order</option>
                            </select>
                        </div>

                        <div className="mt-8">
                            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-transparent px-2 py-2 transition-colors hover:border-(--border)/80 hover:bg-[#050608]/80">
                                <input
                                    type="checkbox"
                                    checked={featuredOnly}
                                    onChange={() => setFeaturedOnly((v) => !v)}
                                    className="h-4 w-4 rounded border-(--border) bg-[#050608] text-(--accent) focus:ring-(--accent)/40"
                                />
                                <span className="text-sm text-foreground">Featured only</span>
                            </label>
                        </div>

                        <div className="mt-8 space-y-3">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-(--muted)">
                                Price (₱)
                            </p>
                            <p className="text-[11px] leading-snug text-(--muted)/90">
                                {initialProducts.length === 0 ? (
                                    <>No listings to price-filter yet.</>
                                ) : priceBounds.min === priceBounds.max ? (
                                    <>
                                        All listings in this catalog are {formatPeso(priceBounds.min)}{" "}
                                        (min and max stay aligned on blur).
                                    </>
                                ) : (
                                    <>
                                        Allowed range follows this catalog (
                                        {formatPeso(priceBounds.min)} – {formatPeso(priceBounds.max)}
                                        ). Out-of-range values snap back when you leave a field.
                                    </>
                                )}
                            </p>
                            <div className="grid grid-cols-2 gap-3">
                                <label className="text-xs text-(--muted)">
                                    <span className="mb-1 block uppercase tracking-wider">Min</span>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        value={priceMinInput}
                                        onChange={(e) => setPriceMinInput(e.target.value)}
                                        onBlur={syncPriceInputsOnBlur}
                                        className={fieldClass}
                                        aria-label="Minimum price in pesos"
                                    />
                                </label>
                                <label className="text-xs text-(--muted)">
                                    <span className="mb-1 block uppercase tracking-wider">Max</span>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        value={priceMaxInput}
                                        onChange={(e) => setPriceMaxInput(e.target.value)}
                                        onBlur={syncPriceInputsOnBlur}
                                        className={fieldClass}
                                        aria-label="Maximum price in pesos"
                                    />
                                </label>
                            </div>
                        </div>

                        <div className="mt-8 border-t border-(--border)/50 pt-5">
                            <button
                                type="button"
                                onClick={clearAllFilters}
                                disabled={!hasActiveFilters}
                                className="w-full rounded-lg border border-(--border) bg-[#050608] py-2.5 text-xs font-semibold uppercase tracking-wider text-(--muted) transition-colors hover:border-(--accent)/35 hover:text-(--accent) disabled:pointer-events-none disabled:opacity-40"
                            >
                                Clear all filters
                            </button>
                        </div>
                    </div>
                </aside>

                <div>
                    <div className="mb-8 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-(--accent) drop-shadow-[0_0_14px_var(--accent)]">
                                {appName} · Shop
                            </p>
                            <h1 className="mt-2 max-w-3xl text-4xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-5xl">
                                Stone{" "}
                                <span className="bg-linear-to-r from-cyan-300 via-(--accent) to-cyan-400 bg-clip-text text-transparent">
                                    Products
                                </span>
                            </h1>
                            <p className="mt-3 max-w-xl text-sm leading-relaxed text-(--muted)">
                                Sculptures, surfaces, and décor from verified sellers. Filter by
                                text, price, availability, or featured listings.
                            </p>
                        </div>
                        <div className="flex shrink-0 flex-col gap-1.5 sm:items-end">
                            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--muted)">
                                Sort by
                            </span>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        aria-label={`Sort by: ${sortLabel}`}
                                        className="h-10 min-w-48 justify-between gap-2 border-(--border) bg-[#080b10] px-3 text-left text-xs font-semibold uppercase tracking-wider text-foreground hover:bg-[#12161f] hover:text-foreground"
                                    >
                                        <span className="truncate">{sortLabel}</span>
                                        <ChevronDown
                                            className="h-4 w-4 shrink-0 opacity-70"
                                            aria-hidden
                                        />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="min-w-48">
                                    <DropdownMenuRadioGroup
                                        value={sortBy}
                                        onValueChange={(value) => setSortBy(value as SortMode)}
                                    >
                                        {CATALOG_SORT_OPTIONS.map((opt) => (
                                            <DropdownMenuRadioItem
                                                key={opt.value}
                                                value={opt.value}
                                            >
                                                {opt.label}
                                            </DropdownMenuRadioItem>
                                        ))}
                                    </DropdownMenuRadioGroup>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>

                    <CatalogResults
                        key={`${filterSignature}|${sortBy}`}
                        sorted={sorted}
                        initialProductsLength={initialProducts.length}
                        filteredLength={filtered.length}
                        hasActiveFilters={hasActiveFilters}
                        clearAllFilters={clearAllFilters}
                    />
                </div>
            </div>
        </main>
    );
}
