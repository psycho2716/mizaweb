"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createProduct,
  deleteProductById,
  getSellerProductDetail,
  getSellerProducts,
  publishProduct,
  updateProduct,
} from "@/lib/api/endpoints";
import { createListingSchema } from "@/types";
import type { Product, ProductDetail } from "@/types";

type CreateListingFormValues = z.infer<typeof createListingSchema>;

export default function SellerListingsPage() {
  const [latestProductId, setLatestProductId] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState<ProductDetail | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPrice, setEditPrice] = useState<number>(0);
  const [editModel3dUrl, setEditModel3dUrl] = useState("");

  async function loadProducts() {
    const response = await getSellerProducts();
    setProducts(response.data);
  }

  async function openProduct(productId: string) {
    const response = await getSellerProductDetail(productId);
    setSelected(response.data);
    setEditTitle(response.data.title);
    setEditDescription(response.data.description);
    setEditPrice(response.data.basePrice);
    setEditModel3dUrl(response.data.model3dUrl ?? "");
  }

  useEffect(() => {
    void loadProducts();
  }, []);
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<CreateListingFormValues>({
    resolver: zodResolver(createListingSchema),
    defaultValues: {
      title: "Stone Tile",
      description: "Polished stone tile",
      basePrice: 1200,
    },
  });

  async function handleCreate(values: CreateListingFormValues) {
    try {
      const response = await createProduct({
        title: values.title,
        description: values.description,
        basePrice: values.basePrice,
      });
      setLatestProductId(response.id);
      await loadProducts();
      toast.success(`Created listing ${response.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Create failed");
    }
  }

  async function handlePublish() {
    if (!latestProductId) {
      toast.info("Create a product first.");
      return;
    }
    try {
      await publishProduct(latestProductId);
      await loadProducts();
      toast.success(`Published ${latestProductId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Publish failed");
    }
  }

  return (
    <main className="mx-auto grid max-w-6xl gap-4 p-6 lg:grid-cols-[380px,1fr]">
      <Card className="h-fit">
        <CardHeader>
          <CardTitle>Seller Listings</CardTitle>
          <CardDescription>Create and publish listing flow.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={handleSubmit(handleCreate)}>
            <div className="grid gap-2">
              <Label htmlFor="title">Title</Label>
              <Input id="title" {...register("title")} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" {...register("description")} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="basePrice">Base price</Label>
              <Input
                id="basePrice"
                type="number"
                {...register("basePrice", { valueAsNumber: true })}
              />
            </div>
            <div className="mt-2 flex gap-2">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Creating..." : "Create Listing"}
              </Button>
              <Button type="button" variant="outline" onClick={handlePublish}>
                Publish Latest
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your products</CardTitle>
          <CardDescription>Click a product to view and edit complete details.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            {products.map((product) => (
              <button
                key={product.id}
                type="button"
                className="rounded-md border border-zinc-200 p-3 text-left text-sm hover:bg-zinc-50"
                onClick={() => void openProduct(product.id)}
              >
                <p className="font-medium text-zinc-900">{product.title}</p>
                <p className="text-zinc-600">PHP {product.basePrice}</p>
                <p className="text-xs text-zinc-500">
                  {product.isPublished ? "Published" : "Draft"}
                </p>
                <p className="mt-1 text-xs text-zinc-700 underline">
                  <Link href={`/seller/listings/${product.id}`}>Open full details page</Link>
                </p>
              </button>
            ))}
            {products.length === 0 ? (
              <p className="text-sm text-zinc-600">No products yet.</p>
            ) : null}
          </div>

          {selected ? (
            <div className="grid gap-3 rounded-md border border-zinc-200 p-4 text-sm">
              <h3 className="text-base font-semibold text-zinc-900">Product details</h3>
              <Label htmlFor="edit-title">Title</Label>
              <Input
                id="edit-title"
                value={editTitle}
                onChange={(event) => setEditTitle(event.target.value)}
              />
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={editDescription}
                onChange={(event) => setEditDescription(event.target.value)}
              />
              <Label htmlFor="edit-price">Base price</Label>
              <Input
                id="edit-price"
                type="number"
                value={editPrice}
                onChange={(event) => setEditPrice(Number(event.target.value))}
              />
              <Label htmlFor="edit-model-url">3D model URL</Label>
              <Input
                id="edit-model-url"
                value={editModel3dUrl}
                onChange={(event) => setEditModel3dUrl(event.target.value)}
                placeholder="https://.../model.glb"
              />
              <div className="grid gap-1">
                <p className="font-medium text-zinc-700">Images</p>
                {selected.media.map((media) => (
                  <a
                    key={media.id}
                    className="text-xs text-zinc-800 underline"
                    href={media.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {media.url}
                  </a>
                ))}
                {selected.media.length === 0 ? (
                  <p className="text-xs text-zinc-500">No images uploaded yet.</p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={async () => {
                    try {
                      await updateProduct(selected.id, {
                        title: editTitle,
                        description: editDescription,
                        basePrice: editPrice,
                        ...(editModel3dUrl ? { model3dUrl: editModel3dUrl } : {}),
                      });
                      await openProduct(selected.id);
                      await loadProducts();
                      toast.success("Product updated.");
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "Update failed");
                    }
                  }}
                >
                  Save Changes
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="border-red-300 text-red-700 hover:bg-red-50"
                  onClick={async () => {
                    try {
                      await deleteProductById(selected.id);
                      setSelected(null);
                      await loadProducts();
                      toast.success("Product deleted.");
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "Delete failed");
                    }
                  }}
                >
                  Delete Product
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-zinc-600">Select a product to view details.</p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
