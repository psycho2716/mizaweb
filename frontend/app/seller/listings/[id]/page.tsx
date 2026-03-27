"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { deleteProductById, getSellerProductDetail, updateProduct } from "@/lib/api/endpoints";
import type { ProductDetail } from "@/types";

export default function SellerProductDetailPage() {
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const productId = params.id;
    const [product, setProduct] = useState<ProductDetail | null>(null);
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [basePrice, setBasePrice] = useState(0);
    const [model3dUrl, setModel3dUrl] = useState("");

    async function load() {
        const response = await getSellerProductDetail(productId);
        setProduct(response.data);
        setTitle(response.data.title);
        setDescription(response.data.description);
        setBasePrice(response.data.basePrice);
        setModel3dUrl(response.data.model3dUrl ?? "");
    }

    useEffect(() => {
        void load();
    }, [productId]);

    if (!product) {
        return (
            <main className="mx-auto max-w-4xl p-6">
                <p className="text-sm text-zinc-600">Loading product details...</p>
            </main>
        );
    }

    return (
        <main className="mx-auto max-w-4xl space-y-4 p-6">
            <div className="flex items-center justify-between">
                <h1 className="text-lg font-semibold text-zinc-900">Product details</h1>
                <Link href="/seller/listings" className="text-sm underline">
                    Back to listings
                </Link>
            </div>
            <Card>
                <CardHeader>
                    <CardTitle>{product.title}</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3">
                    <Label htmlFor="title">Title</Label>
                    <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                        id="description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                    />
                    <Label htmlFor="basePrice">Base price</Label>
                    <Input
                        id="basePrice"
                        type="number"
                        value={basePrice}
                        onChange={(e) => setBasePrice(Number(e.target.value))}
                    />
                    <Label htmlFor="model3d">3D model URL (.glb / .gltf)</Label>
                    <Input
                        id="model3d"
                        value={model3dUrl}
                        onChange={(e) => setModel3dUrl(e.target.value)}
                        placeholder="https://.../model.glb"
                    />
                    {model3dUrl ? (
                        <a
                            href={model3dUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm underline"
                        >
                            Open 3D model
                        </a>
                    ) : null}
                    <div className="grid gap-1">
                        <p className="text-sm font-medium text-zinc-700">Images</p>
                        {product.media.length === 0 ? (
                            <p className="text-sm text-zinc-500">No media uploaded.</p>
                        ) : null}
                        {product.media.map((media) => (
                            <a
                                key={media.id}
                                href={media.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sm underline"
                            >
                                {media.url}
                            </a>
                        ))}
                    </div>
                    <div className="flex gap-2">
                        <Button
                            type="button"
                            onClick={async () => {
                                try {
                                    await updateProduct(productId, {
                                        title,
                                        description,
                                        basePrice,
                                        ...(model3dUrl ? { model3dUrl } : {})
                                    });
                                    await load();
                                    toast.success("Product updated.");
                                } catch (error) {
                                    toast.error(error instanceof Error ? error.message : "Update failed");
                                }
                            }}
                        >
                            Save
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            className="border-red-300 text-red-700 hover:bg-red-50"
                            onClick={async () => {
                                try {
                                    await deleteProductById(productId);
                                    toast.success("Product deleted.");
                                    router.push("/seller/listings");
                                } catch (error) {
                                    toast.error(error instanceof Error ? error.message : "Delete failed");
                                }
                            }}
                        >
                            Delete
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </main>
    );
}
