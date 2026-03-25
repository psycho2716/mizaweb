import Link from "next/link";

import { getAppName } from "@/lib/utils";
import { env } from "@/lib/env";
import type { ProductSummary, ProductsApiResponse } from "@/types";

export default async function PublicCatalogPage() {
  const res = await fetch(`${env.NEXT_PUBLIC_BACKEND_URL}/products`, { cache: "no-store" });
  const json: unknown = await res.json();
  const productsApi = json && typeof json === "object" ? (json as ProductsApiResponse) : null;
  const products = productsApi?.products?.length ? productsApi.products : [];

  return (
    <div className="min-h-screen p-8 bg-zinc-50">
      <h1 className="text-2xl font-semibold">{getAppName()} — Catalog</h1>
      <p className="text-zinc-600 mt-2 text-sm">Published products from verified sellers. Customize and 3D preview require a customer account.</p>
      <ul className="mt-6 space-y-3 max-w-xl">
        {products.length === 0 ? (
          <li className="text-zinc-600 text-sm">No products yet.</li>
        ) : (
          products.map((p: ProductSummary) => (
            <li key={p.id} className="border border-zinc-200 rounded-lg p-3 bg-white flex justify-between gap-2 items-center">
              <span className="font-medium">{p.name}</span>
              <Link href={`/products/${p.id}`} className="text-sm text-sky-700 shrink-0">
                Open
              </Link>
            </li>
          ))
        )}
      </ul>
      <p className="mt-8 text-sm">
        <Link href="/" className="text-zinc-600 hover:text-zinc-900">
          ← Home
        </Link>
      </p>
    </div>
  );
}
