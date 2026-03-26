"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { addCartItem, checkoutCart } from "@/lib/api/endpoints";
import type { ProductDetail } from "@/types";

interface ProductDetailClientProps {
  product: ProductDetail;
}

export function ProductDetailClient({ product }: ProductDetailClientProps) {
  const router = useRouter();
  const [quantity, setQuantity] = useState(1);
  const [selectedImage, setSelectedImage] = useState(product.media[0]?.url ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedSpecs, setSelectedSpecs] = useState<Record<string, string>>({});
  const [threeDColor, setThreeDColor] = useState("Natural");
  const [threeDTexture, setThreeDTexture] = useState("Polished");

  const has3D = useMemo(() => {
    return product.options.some((option) => option.name.toLowerCase().includes("color"));
  }, [product.options]);

  async function handleAddToCart() {
    setIsSubmitting(true);
    try {
      await addCartItem(product.id, quantity);
      toast.success("Added to cart");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add to cart");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleBuyNow() {
    const token = typeof window !== "undefined" ? localStorage.getItem("miza_token") : null;
    if (!token) {
      toast.info("Please login before checkout.");
      router.push("/auth/login");
      return;
    }

    setIsSubmitting(true);
    try {
      await addCartItem(product.id, quantity);
      await checkoutCart({ paymentMethod: "cash" });
      toast.success("Order placed");
      router.push("/buyer/orders");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Checkout failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="mx-auto grid max-w-6xl gap-6 p-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Product Images</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="h-72 rounded-md border border-zinc-200 bg-zinc-100">
            {selectedImage ? (
              <img src={selectedImage} alt={product.title} className="h-full w-full rounded-md object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-zinc-500">
                No image available
              </div>
            )}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {product.media.map((image) => (
              <button
                key={image.id}
                type="button"
                onClick={() => setSelectedImage(image.url)}
                className="rounded border border-zinc-200 bg-white p-1"
              >
                <img src={image.url} alt={product.title} className="h-14 w-full rounded object-cover" />
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>{product.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-zinc-700">{product.description}</p>
            <p className="text-base font-semibold">PHP {product.basePrice}</p>
            <Link href={`/sellers/${product.sellerId}`} className="text-sm underline">
              View seller profile
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Customize specs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {product.options.map((option) => (
              <label key={option.id} className="block text-sm">
                <span className="mb-1 block text-zinc-700">{option.name}</span>
                <select
                  className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3"
                  value={selectedSpecs[option.id] ?? ""}
                  onChange={(event) =>
                    setSelectedSpecs((previous) => ({ ...previous, [option.id]: event.target.value }))
                  }
                >
                  <option value="">Select {option.name}</option>
                  {option.values.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <label className="block text-sm">
              <span className="mb-1 block text-zinc-700">Quantity</span>
              <input
                type="number"
                min={1}
                value={quantity}
                onChange={(event) => setQuantity(Number(event.target.value))}
                className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3"
              />
            </label>
          </CardContent>
        </Card>

        {has3D ? (
          <Card>
            <CardHeader>
              <CardTitle>3D Model Preview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="rounded-md border border-dashed border-zinc-300 bg-zinc-50 p-3 text-zinc-600">
                Interactive 3D area placeholder (color, dimensions, texture controls).
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label>
                  <span className="mb-1 block text-zinc-700">Color</span>
                  <select
                    className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3"
                    value={threeDColor}
                    onChange={(event) => setThreeDColor(event.target.value)}
                  >
                    <option>Natural</option>
                    <option>Ivory</option>
                    <option>Charcoal</option>
                  </select>
                </label>
                <label>
                  <span className="mb-1 block text-zinc-700">Texture</span>
                  <select
                    className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3"
                    value={threeDTexture}
                    onChange={(event) => setThreeDTexture(event.target.value)}
                  >
                    <option>Polished</option>
                    <option>Matte</option>
                    <option>Brushed</option>
                  </select>
                </label>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <div className="flex gap-3">
          <Button type="button" onClick={() => void handleAddToCart()} disabled={isSubmitting}>
            Add to cart
          </Button>
          <Button type="button" variant="outline" onClick={() => void handleBuyNow()} disabled={isSubmitting}>
            Buy now
          </Button>
        </div>
      </div>
    </main>
  );
}
