"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCart } from "@/lib/api/endpoints";
import type { CartItemResponse } from "@/types";

export default function CartPage() {
  const [items, setItems] = useState<CartItemResponse[]>([]);

  useEffect(() => {
    getCart()
      .then((response) => setItems(response.data))
      .catch(() => setItems([]));
  }, []);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-8 sm:px-6 lg:py-10">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--accent)">Basket</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">Your cart</h1>
        <p className="mt-2 text-sm text-(--muted)">
          Review line items, then continue to orders & checkout (sign in required).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {items.map((item) => (
            <div
              key={item.id}
              className="rounded-lg border border-(--border) bg-[#080b10] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
            >
              <p className="font-mono text-xs text-(--muted)">Product</p>
              <p className="font-medium text-foreground">{item.productId}</p>
              <p className="mt-2 text-(--muted)">
                Qty <span className="tabular-nums text-foreground">{item.quantity}</span>
              </p>
            </div>
          ))}
          {items.length === 0 ? (
            <p className="text-(--muted)">Your cart is empty.</p>
          ) : null}
          <p className="border-t border-(--border) pt-4 text-(--muted)">
            Proceed to{" "}
            <Link href="/buyer/orders" className="font-semibold text-(--accent) underline-offset-4 hover:underline">
              checkout
            </Link>{" "}
            (login required).
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
