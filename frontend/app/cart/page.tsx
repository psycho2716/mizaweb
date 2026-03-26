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
    <main className="mx-auto max-w-3xl space-y-4 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Cart</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {items.map((item) => (
            <div key={item.id} className="rounded border border-zinc-200 p-3">
              <p>Product ID: {item.productId}</p>
              <p>Quantity: {item.quantity}</p>
            </div>
          ))}
          {items.length === 0 ? <p className="text-zinc-600">Your cart is empty.</p> : null}
          <p className="text-zinc-600">
            Proceed to{" "}
            <Link href="/buyer/orders" className="underline">
              checkout
            </Link>{" "}
            (login required).
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
