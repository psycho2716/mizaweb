import { apiFetch } from "@/lib/api/client";
import type { Product } from "@/types";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

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
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="mb-4 text-2xl font-semibold">Published Products</h1>
      <div className="grid gap-3">
        {products.map((product) => (
          <Link key={product.id} href={`/products/${product.id}`}>
            <Card className="hover:border-zinc-400">
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <CardTitle>{product.title}</CardTitle>
                <Badge>Published</Badge>
              </CardHeader>
              <CardContent className="text-sm text-zinc-600">
                PHP {product.basePrice}
              </CardContent>
            </Card>
          </Link>
        ))}
        {products.length === 0 ? (
          <EmptyState
            title="No published products"
            description="Sellers have not published any products yet."
          />
        ) : null}
      </div>
    </main>
  );
}
