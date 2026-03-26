import Link from "next/link";
import type { LandingHighlightsResponse } from "@/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-10 px-6 py-10">
      <section className="relative overflow-hidden rounded-3xl border border-zinc-200 bg-linear-to-br from-white via-zinc-50 to-amber-50 px-6 py-10 shadow-sm md:px-10">
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-amber-200/30 blur-3xl" />
        <div className="absolute -bottom-20 left-10 h-52 w-52 rounded-full bg-zinc-300/20 blur-3xl" />
        <div className="relative grid items-center gap-8 md:grid-cols-2">
          <div className="space-y-5">
            <p className="inline-block rounded-full bg-zinc-900 px-3 py-1 text-xs font-medium text-white">
              Trusted Marketplace
            </p>
            <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 md:text-5xl">
              Premium stone marketplace for modern projects
            </h1>
            <p className="max-w-xl text-sm leading-6 text-zinc-600 md:text-base">
              Buy from verified sellers, compare top listings, and manage orders in one secure
              platform built for production use.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/products"
                className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700"
              >
                Shop now
              </Link>
              <Link
                href="/auth/register"
                className="rounded-lg border border-zinc-300 bg-white px-5 py-2.5 text-sm font-medium text-zinc-900 transition hover:bg-zinc-100"
              >
                Create account
              </Link>
              <Link
                href="/auth/login"
                className="rounded-lg border border-transparent px-5 py-2.5 text-sm font-medium text-zinc-700 transition hover:border-zinc-300 hover:bg-white"
              >
                Login
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2 text-xs text-zinc-600 sm:grid-cols-4">
              <span className="rounded-md border border-zinc-200 bg-white px-3 py-2">Secure checkout</span>
              <span className="rounded-md border border-zinc-200 bg-white px-3 py-2">Verified sellers</span>
              <span className="rounded-md border border-zinc-200 bg-white px-3 py-2">Order tracking</span>
              <span className="rounded-md border border-zinc-200 bg-white px-3 py-2">Fast support</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {highlights.recommendedProducts.slice(0, 4).map((product) => (
              <Link key={product.id} href={`/products/${product.id}`}>
                <Card className="h-full border-zinc-200 bg-white/95 transition hover:-translate-y-0.5 hover:shadow-md">
                  <CardHeader className="space-y-1">
                    <CardDescription className="text-xs uppercase tracking-wide text-zinc-500">
                      Featured
                    </CardDescription>
                    <CardTitle className="line-clamp-2 text-base">{product.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-zinc-600">PHP {product.basePrice}</CardContent>
                </Card>
              </Link>
            ))}
            {highlights.recommendedProducts.length === 0 ? (
              <Card className="col-span-2 border-dashed">
                <CardContent className="p-5 text-sm text-zinc-600">
                  Featured products will appear here once listings are published.
                </CardContent>
              </Card>
            ) : null}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold text-zinc-900">Top Recommended Products</h2>
          <Link href="/products" className="text-sm font-medium text-zinc-600 hover:text-zinc-900">
            View all products
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {highlights.recommendedProducts.slice(0, 6).map((product) => (
            <Link key={product.id} href={`/products/${product.id}`}>
              <Card className="h-full border-zinc-200 transition hover:-translate-y-0.5 hover:shadow-md">
                <CardHeader>
                  <CardTitle className="line-clamp-1 text-lg">{product.title}</CardTitle>
                  <CardDescription className="line-clamp-2">{product.description}</CardDescription>
                </CardHeader>
                <CardContent className="text-sm font-medium text-zinc-800">PHP {product.basePrice}</CardContent>
              </Card>
            </Link>
          ))}
          {highlights.recommendedProducts.length === 0 ? (
            <p className="text-sm text-zinc-600">No published products yet.</p>
          ) : null}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-zinc-900">Top Sellers</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {highlights.topSellers.map((seller, index) => (
            <Card key={seller.id} className="border-zinc-200">
              <CardHeader>
                <CardDescription className="text-xs uppercase tracking-wide text-zinc-500">
                  Rank #{index + 1}
                </CardDescription>
                <CardTitle className="line-clamp-1 text-base">{seller.email}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-zinc-600">
                {seller.publishedCount} published listings
              </CardContent>
            </Card>
          ))}
          {highlights.topSellers.length === 0 ? (
            <p className="text-sm text-zinc-600">No seller rankings yet.</p>
          ) : null}
        </div>
      </section>

    </main>
  );
}
