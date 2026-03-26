import { apiFetch } from "@/lib/api/client";
import type { Product } from "@/types";

interface ProductResponse {
  data: Product[];
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const response = await apiFetch<ProductResponse>("/products");
  const product = response.data.find((entry) => entry.id === id);

  if (!product) {
    return <main className="p-6">Product not found.</main>;
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-semibold">{product.title}</h1>
      <p className="mt-2 text-sm text-zinc-700">{product.description}</p>
      <p className="mt-3 font-medium">Base Price: PHP {product.basePrice}</p>
    </main>
  );
}
