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
    return <main className="p-6">Product not found.</main>;
  }
  const payload = (await response.json()) as ProductDetailResponse;
  const product = payload.data;

  if (!product) {
    return <main className="p-6">Product not found.</main>;
  }

  return <ProductDetailClient product={product} />;
}
