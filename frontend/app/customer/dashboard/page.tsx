import Link from "next/link";

import { getAppName } from "@/lib/utils";
import { env } from "@/lib/env";
import type { ProductSummary, ProductsApiResponse } from "@/types";

export default async function CustomerDashboardPage() {
  const res = await fetch(`${env.NEXT_PUBLIC_BACKEND_URL}/products`, { cache: "no-store" });
  const json: unknown = await res.json();
  const productsApi = json && typeof json === "object" ? (json as ProductsApiResponse) : null;
  const products = productsApi?.products?.length ? productsApi.products : [];

  return (
    <div className="min-h-screen p-8 bg-zinc-50">
      <h1 className="text-2xl font-semibold">{getAppName()} - Customer</h1>
      <p className="text-zinc-600 mt-2">Browse verified sellers’ published listings. Open a product to customize and request a 3D preview.</p>

      <section className="mt-6 bg-white border border-zinc-200 rounded-xl p-4">
        <h2 className="text-lg font-medium">Published products</h2>

        {products.length === 0 ? (
          <p className="text-zinc-600 mt-2 text-sm">No published products yet.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {products.map((p: ProductSummary) => (
              <li key={p.id} className="border border-zinc-200 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <div className="font-medium">{p.name}</div>
                  <div className="text-sm text-zinc-600">{p.category}</div>
                </div>
                <Link
                  href={`/products/${p.id}`}
                  className="text-sm font-medium text-sky-700 hover:text-sky-900 shrink-0"
                >
                  View & customize →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

