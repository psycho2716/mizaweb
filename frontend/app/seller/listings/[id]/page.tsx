"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Suspense, use, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useConfirmDialog } from "@/hooks/use-confirm-dialog";
import { deleteProductById, getSellerProductDetail, updateProduct } from "@/lib/api/endpoints";
import { cn, formatPeso } from "@/lib/utils";
import type { ProductDetail } from "@/types";

const inputDark =
    "border-(--border) bg-[#080b10] text-foreground placeholder:text-(--muted) focus-visible:border-(--accent)/50";
const btnPrimary =
    "bg-(--accent) font-semibold uppercase tracking-wide text-[#050608] hover:bg-(--accent)/90";

function ListingDetailLoading() {
    return (
        <div className="p-4 md:p-6">
            <p className="text-sm text-(--muted)">Loading product details…</p>
        </div>
    );
}

function ProductEditor({
    productId,
    onSaved
}: {
    productId: string;
    onSaved: () => void;
}) {
    const { requestConfirm, dialog: confirmDialog } = useConfirmDialog();
    const router = useRouter();
    const response = use(useMemo(() => getSellerProductDetail(productId), [productId]));
    const product: ProductDetail = response.data;

    const [title, setTitle] = useState(product.title);
    const [description, setDescription] = useState(product.description);
    const [basePrice, setBasePrice] = useState(product.basePrice);
    const [model3dUrl, setModel3dUrl] = useState(product.model3dUrl ?? "");

    const primaryImage = product.media[0]?.url;

    return (
        <div className="p-4 md:p-6">
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <p className="text-[10px] font-semibold tracking-wide text-(--accent)">
                        Your products
                    </p>
                    <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
                        Edit product
                        <span className="text-(--muted)"> · </span>
                        <span className="font-mono text-lg text-(--accent)">{product.id}</span>
                    </h1>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        className="border-(--border) bg-transparent text-foreground hover:bg-(--surface-elevated)"
                        onClick={() => {
                            setTitle(product.title);
                            setDescription(product.description);
                            setBasePrice(product.basePrice);
                            setModel3dUrl(product.model3dUrl ?? "");
                            toast.message("Changes discarded", {
                                description: "Form reset to last saved values."
                            });
                        }}
                    >
                        Discard changes
                    </Button>
                    <Button
                        type="button"
                        className={btnPrimary}
                        onClick={() => router.push("/seller/listings")}
                    >
                        Back to products
                    </Button>
                </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
                <div className="space-y-6">
                    <section className="rounded-lg border border-(--border) bg-(--surface) p-5">
                        <h2 className="border-l-2 border-(--accent) pl-3 text-sm font-semibold tracking-tight text-foreground">
                            Product details
                        </h2>
                        <div className="mt-4 grid gap-3">
                            <Label htmlFor="title" className="text-(--muted)">
                                Title
                            </Label>
                            <Input
                                id="title"
                                className={inputDark}
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                            />
                            <Label htmlFor="description" className="text-(--muted)">
                                Description
                            </Label>
                            <Textarea
                                id="description"
                                className={cn(inputDark, "min-h-[120px]")}
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                            />
                            <Label htmlFor="basePrice" className="text-(--muted)">
                                Base price
                            </Label>
                            <Input
                                id="basePrice"
                                type="number"
                                className={inputDark}
                                value={basePrice}
                                onChange={(e) => setBasePrice(Number(e.target.value))}
                            />
                            <Label htmlFor="model3d" className="text-(--muted)">
                                3D file link (optional)
                            </Label>
                            <Input
                                id="model3d"
                                className={inputDark}
                                value={model3dUrl}
                                onChange={(e) => setModel3dUrl(e.target.value)}
                                placeholder="https://… (3D model file)"
                            />
                            {model3dUrl ? (
                                <a
                                    href={model3dUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-sm font-medium text-(--accent) underline-offset-2 hover:underline"
                                >
                                    Open 3D file
                                </a>
                            ) : null}
                        </div>
                    </section>

                    <section className="rounded-lg border border-(--border) bg-(--surface) p-5">
                        <h2 className="border-l-2 border-(--accent) pl-3 text-sm font-semibold tracking-tight text-foreground">
                            Photos &amp; files
                        </h2>
                        <div className="mt-4 grid gap-2">
                            {product.media.length === 0 ? (
                                <p className="text-sm text-(--muted)">No media uploaded.</p>
                            ) : null}
                            {product.media.map((media) => (
                                <a
                                    key={media.id}
                                    href={media.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="truncate text-sm text-(--accent) underline"
                                >
                                    {media.url}
                                </a>
                            ))}
                        </div>
                    </section>

                    <div className="flex flex-wrap gap-2">
                        <Button
                            type="button"
                            className={btnPrimary}
                            onClick={async () => {
                                try {
                                    await updateProduct(productId, {
                                        title,
                                        description,
                                        basePrice,
                                        ...(model3dUrl ? { model3dUrl } : {})
                                    });
                                    onSaved();
                                    toast.success("Product updated.");
                                } catch (error) {
                                    toast.error(
                                        error instanceof Error ? error.message : "Update failed"
                                    );
                                }
                            }}
                        >
                            Save changes
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            className="border-red-500/40 text-red-300 hover:bg-red-950/30"
                            onClick={async () => {
                                const ok = await requestConfirm({
                                    title: "Delete this product?",
                                    description: "This removes the listing and cannot be undone.",
                                    confirmLabel: "Delete",
                                    destructive: true
                                });
                                if (!ok) return;
                                try {
                                    await deleteProductById(productId);
                                    toast.success("Product deleted.");
                                    router.push("/seller/listings");
                                } catch (error) {
                                    toast.error(
                                        error instanceof Error ? error.message : "Delete failed"
                                    );
                                }
                            }}
                        >
                            Delete
                        </Button>
                        <Link
                            href="/seller/listings"
                            className="inline-flex h-10 items-center rounded-md border border-(--border) px-4 text-sm font-medium text-(--muted) transition-colors hover:bg-(--surface-elevated) hover:text-foreground"
                        >
                            Cancel
                        </Link>
                    </div>
                </div>

                <aside className="space-y-4">
                    <div className="overflow-hidden rounded-lg border border-(--border) bg-(--surface)">
                        <div
                            className={cn(
                                "relative aspect-[3/4] bg-gradient-to-br from-(--surface-elevated) to-[#050608]",
                                primaryImage && "bg-cover bg-center"
                            )}
                            style={
                                primaryImage
                                    ? { backgroundImage: `url(${primaryImage})` }
                                    : undefined
                            }
                        >
                            {!primaryImage ? (
                                <div className="flex h-full items-center justify-center p-4 text-center text-xs text-(--muted)">
                                    No preview image
                                </div>
                            ) : null}
                        </div>
                        <div className="border-t border-(--border) p-4">
                            <p className="text-sm font-semibold text-foreground">{product.title}</p>
                            <p className="mt-1 text-xs text-(--muted)">
                                {formatPeso(product.basePrice)} / unit
                            </p>
                        </div>
                    </div>
                    <div className="rounded-lg border border-(--border) bg-[#080b10]/60 p-4 text-xs text-(--muted)">
                        <p className="font-semibold tracking-wide text-(--accent)">
                            Tip
                        </p>
                        <p className="mt-2 leading-relaxed">
                            Clear titles and good photos help customers find your products. Save to
                            update your store.
                        </p>
                    </div>
                </aside>
            </div>
            {confirmDialog}
        </div>
    );
}

export default function SellerProductDetailPage() {
    const params = useParams<{ id: string }>();
    const productId = params.id;
    const [reloadKey, setReloadKey] = useState(0);

    return (
        <Suspense fallback={<ListingDetailLoading />}>
            <ProductEditor
                key={`${productId}-${reloadKey}`}
                productId={productId}
                onSaved={() => setReloadKey((k) => k + 1)}
            />
        </Suspense>
    );
}
