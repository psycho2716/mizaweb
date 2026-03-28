import Link from "next/link";
import { apiFetch } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { Product } from "@/types";

interface ProductsResponse {
  data: Product[];
}

export default async function ProductsPage() {
  let products: Product[] = [];
  try {
    const response = await apiFetch<ProductsResponse>("/products");
    products = response.data;
  } catch {
    products = [];
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:py-10">
      <div className="mb-8 border-b border-(--border) pb-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--accent)">Shop</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
          Stone goods catalog
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-(--muted)">
          Sculptures, kitchen and dining, décor, accessories, and gifts from verified sellers—all
          priced in PHP.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((product) => (
          <Link key={product.id} href={`/products/${product.id}`} className="group block">
            <Card className="h-full transition-colors hover:border-(--accent)/45">
              <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-2">
                <CardTitle className="line-clamp-2 text-base leading-snug">{product.title}</CardTitle>
                <Badge className="shrink-0">Live</Badge>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-lg font-semibold tabular-nums text-(--accent)">
                  PHP {product.basePrice.toLocaleString()}
                </p>
                <p className="text-xs font-semibold uppercase tracking-wider text-(--muted) group-hover:text-(--accent)">
                  View details →
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
        {products.length === 0 ? (
          <div className="sm:col-span-2 lg:col-span-3">
            <EmptyState
              title="No listings yet"
              description="Sellers haven’t published products. Check back soon."
            />
          </div>
        ) : null}
      </div>
    </main>
  );
}
