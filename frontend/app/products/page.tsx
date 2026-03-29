import { apiFetch } from "@/lib/api/client";
import type { Product } from "@/types";
import { ProductsListingClient } from "./products-listing-client";

interface ProductsResponse {
  data: Product[];
}

export default async function ProductsPage({
  searchParams
}: {
  searchParams: Promise<{ seller?: string }>;
}) {
  const { seller } = await searchParams;
  const path =
    typeof seller === "string" && seller.length > 0
      ? `/products?seller=${encodeURIComponent(seller)}`
      : "/products";
  let products: Product[] = [];
  try {
    const response = await apiFetch<ProductsResponse>(path);
    products = response.data;
  } catch {
    products = [];
  }

  return <ProductsListingClient initialProducts={products} />;
}
