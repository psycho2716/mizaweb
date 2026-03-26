import { apiFetch } from "@/lib/api/client";
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
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="mb-4 text-2xl font-semibold">Published Products</h1>
      <div className="grid gap-3">
        {products.map((product) => (
          <a
            key={product.id}
            href={`/products/${product.id}`}
            className="rounded border p-4"
          >
            <div className="font-medium">{product.title}</div>
            <div className="text-sm text-zinc-600">PHP {product.basePrice}</div>
          </a>
        ))}
        {products.length === 0 ? (
          <p className="text-sm text-zinc-600">No published products yet.</p>
        ) : null}
      </div>
    </main>
  );
}
