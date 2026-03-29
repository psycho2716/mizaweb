import type { ProductDetailResponse } from "@/types";
import { ProductDetailClient } from "./product-detail-client";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const response = await fetch(`${BACKEND_URL}/products/${id}`, { cache: "no-store" });
  if (!response.ok) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <p className="text-(--muted)">Product not found.</p>
      </main>
    );
  }
  const payload = (await response.json()) as ProductDetailResponse;
  const product = payload.data
    ? {
        ...payload.data,
        reviewSummary: payload.data.reviewSummary ?? {
          averageRating: null as number | null,
          reviewCount: 0
        }
      }
    : null;

  if (!product) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <p className="text-(--muted)">Product not found.</p>
      </main>
    );
  }

  return <ProductDetailClient key={product.id} product={product} />;
}
