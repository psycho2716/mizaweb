"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { addCartItem, checkoutCart } from "@/lib/api/endpoints";
import type { ProductDetail } from "@/types";

const fieldClass =
  "h-10 w-full rounded-md border border-(--border) bg-[#080b10] px-3 text-sm text-foreground placeholder:text-(--muted) focus-visible:border-(--accent)/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/25";

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
    <main className="mx-auto grid max-w-6xl flex-1 gap-6 px-4 py-8 sm:px-6 md:grid-cols-2 lg:py-10">
      <Card>
        <CardHeader>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--accent)">Gallery</p>
          <CardTitle className="mt-1">Product images</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="h-72 overflow-hidden rounded-lg border border-(--border) bg-[#080b10] ring-1 ring-white/[0.04]">
            {selectedImage ? (
              <img
                src={selectedImage}
                alt={product.title}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-(--muted)">
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
                className="rounded-md border border-(--border) bg-[#080b10] p-1 ring-1 ring-white/[0.04] transition-colors hover:border-(--accent)/40"
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
            <p className="leading-relaxed text-(--muted)">{product.description}</p>
            <p className="text-xl font-semibold tabular-nums text-(--accent)">
              PHP {product.basePrice.toLocaleString()}
            </p>
            <Link
              href={`/sellers/${product.sellerId}`}
              className="inline-flex text-sm font-semibold text-(--accent) underline-offset-4 hover:underline"
            >
              View seller storefront →
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Options</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {product.options.map((option) => (
              <label key={option.id} className="block text-sm">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-(--muted)">
                  {option.name}
                </span>
                <select
                  className={fieldClass}
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
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-(--muted)">
                Quantity
              </span>
              <input
                type="number"
                min={1}
                value={quantity}
                onChange={(event) => setQuantity(Number(event.target.value))}
                className={fieldClass}
              />
            </label>
          </CardContent>
        </Card>

        {has3D ? (
          <Card>
            <CardHeader>
              <CardTitle>3D preview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="rounded-lg border border-dashed border-(--border) bg-[#080b10] p-3 text-(--muted)">
                Interactive 3D area placeholder (color, dimensions, texture controls).
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label>
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-(--muted)">
                    Color
                  </span>
                  <select
                    className={fieldClass}
                    value={threeDColor}
                    onChange={(event) => setThreeDColor(event.target.value)}
                  >
                    <option>Natural</option>
                    <option>Ivory</option>
                    <option>Charcoal</option>
                  </select>
                </label>
                <label>
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-(--muted)">
                    Texture
                  </span>
                  <select
                    className={fieldClass}
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

        <div className="flex flex-wrap gap-3 pt-1">
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
