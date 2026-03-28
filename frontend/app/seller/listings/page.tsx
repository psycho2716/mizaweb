"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode
} from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { ImagePlus, Loader2, Plus, ScanLine, Video, X } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { AdminTablePagination } from "@/components/admin/admin-table-pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    addProductMedia,
    createProduct,
    createProductMediaUploadUrl,
    createProductModel3dUploadUrl,
    deleteProductById,
    deleteProductMedia,
    getSellerProductDetail,
    getSellerProducts,
    imageFileTo3dModel,
    publishProduct,
    updateProduct
} from "@/lib/api/endpoints";
import {
    COLORS_OPTION_NAME,
    DIMENSIONS_OPTION_NAME,
    getProductOptionValues
} from "@/lib/product-variant-options";
import { cn } from "@/lib/utils";
import type {
    Product,
    ProductDetail,
    SellerProductCreateInput,
    SellerProductPatchInput
} from "@/types";
import { sellerProductFormSchema, type SellerProductFormValues } from "@/types";

const ProductModelPreview = dynamic(
    () =>
        import("@/components/seller/product-model-preview").then((m) => ({
            default: m.ProductModelPreview
        })),
    { ssr: false, loading: () => <div className="h-56 animate-pulse rounded-md bg-[#080b10]" /> }
);

type CreateImageEntry = { key: string; file: File; preview: string };
type CreateVideoEntry = { file: File; preview: string };

type EditImageEntry =
    | { kind: "server"; key: string; mediaId: string; url: string }
    | { kind: "local"; key: string; file: File; preview: string };

type EditVideoEntry =
    | { kind: "server"; url: string; preview: string }
    | { kind: "local"; file: File; preview: string };

type Pending3dSource = { file: File; preview: string };
type Pending3dGlb = { blob: Blob; previewUrl: string };

const PAGE_SIZE = 10;

const inputDark =
    "border-(--border) bg-[#080b10] text-foreground placeholder:text-(--muted) focus-visible:border-(--accent)/50 focus-visible:ring-(--accent)/25";
const btnPrimary =
    "bg-(--accent) font-semibold uppercase tracking-wider text-[#050608] hover:bg-(--accent)/90";
const btnOutline = "border-(--border) bg-transparent text-foreground hover:bg-(--surface-elevated)";

const tableCell = "border-(--border) px-3 py-2.5 text-sm align-middle";
const tableHead =
    "border-(--border) px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-(--muted)";

const defaultFormValues: SellerProductFormValues = {
    title: "",
    description: "",
    basePrice: 1,
    madeToOrder: false,
    stockQuantity: 0,
    isFeatured: false,
    dimensionsRequiredFor3d: false,
    dimensionsText: "",
    colorsText: ""
};

function parseLines(text: string | undefined): string[] {
    return (text ?? "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
}

function productDetailToFormValues(detail: ProductDetail): SellerProductFormValues {
    return {
        title: detail.title,
        description: detail.description,
        basePrice: detail.basePrice,
        madeToOrder: detail.madeToOrder === true,
        stockQuantity: detail.madeToOrder === true ? undefined : (detail.stockQuantity ?? 0),
        isFeatured: detail.isFeatured === true,
        dimensionsRequiredFor3d: Boolean(detail.model3dUrl?.trim()),
        dimensionsText: getProductOptionValues(detail.options, DIMENSIONS_OPTION_NAME).join("\n"),
        colorsText: getProductOptionValues(detail.options, COLORS_OPTION_NAME).join("\n")
    };
}

function buildCreatePayload(values: SellerProductFormValues): SellerProductCreateInput {
    return {
        title: values.title,
        description: values.description,
        basePrice: values.basePrice,
        madeToOrder: values.madeToOrder,
        stockQuantity: values.madeToOrder ? undefined : values.stockQuantity,
        isFeatured: values.isFeatured,
        dimensionChoices: parseLines(values.dimensionsText),
        colorChoices: parseLines(values.colorsText)
    };
}

function buildPatchPayload(
    values: SellerProductFormValues,
    videoUrl: string,
    model3dUrl: string
): SellerProductPatchInput {
    return {
        ...buildCreatePayload(values),
        videoUrl,
        model3dUrl
    };
}

function readFileAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const r = reader.result as string;
            const i = r.indexOf(",");
            resolve(i >= 0 ? r.slice(i + 1) : r);
        };
        reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
        reader.readAsDataURL(file);
    });
}

async function uploadProductModel3dBlob(productId: string, blob: Blob): Promise<string> {
    const target = await createProductModel3dUploadUrl(productId, "model.glb");
    const putRes = await fetch(target.uploadUrl, {
        method: "PUT",
        body: blob,
        headers: { "Content-Type": "model/gltf-binary" }
    });
    if (!putRes.ok) {
        throw new Error("3D model upload failed");
    }
    return target.uploadUrl;
}

async function uploadProductImageFile(productId: string, file: File): Promise<void> {
    const target = await createProductMediaUploadUrl(productId, file.name, "image");
    const putRes = await fetch(target.uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" }
    });
    if (!putRes.ok) {
        throw new Error("Image upload failed");
    }
    await addProductMedia(productId, target.uploadUrl);
}

async function uploadProductVideoFile(productId: string, file: File): Promise<string> {
    const target = await createProductMediaUploadUrl(productId, file.name, "video");
    const putRes = await fetch(target.uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" }
    });
    if (!putRes.ok) {
        throw new Error("Video upload failed");
    }
    return target.uploadUrl;
}

function MediaThumb({
    previewUrl,
    video,
    onRemove,
    removeLabel,
    disabled
}: {
    previewUrl: string;
    video?: boolean;
    onRemove: () => void;
    removeLabel: string;
    disabled?: boolean;
}) {
    return (
        <div className="shrink-0 p-1.5">
            <div className="relative aspect-square w-[104px] rounded-md border border-(--border) bg-[#080b10] shadow-sm">
                <div className="absolute inset-0 overflow-hidden rounded-[inherit]">
                    {video ? (
                        <video
                            src={previewUrl}
                            className="h-full w-full object-cover"
                            muted
                            playsInline
                            preload="metadata"
                        />
                    ) : (
                        // eslint-disable-next-line @next/next/no-img-element -- user-uploaded blob or remote preview
                        <img src={previewUrl} alt="" className="h-full w-full object-cover" />
                    )}
                </div>
                <button
                    type="button"
                    disabled={disabled}
                    onClick={onRemove}
                    className="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-white shadow-md ring-2 ring-[#0b0e14] hover:bg-red-500 disabled:pointer-events-none disabled:opacity-50"
                    aria-label={removeLabel}
                >
                    <X className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                </button>
            </div>
        </div>
    );
}

function MediaAddTile({
    onClick,
    disabled,
    label,
    ariaLabel,
    kind
}: {
    onClick: () => void;
    disabled?: boolean;
    label: string;
    ariaLabel: string;
    kind: "image" | "video" | "source";
}) {
    return (
        <div className="shrink-0 p-1.5">
        <button
            type="button"
            disabled={disabled}
            onClick={onClick}
            aria-label={ariaLabel}
            className={cn(
                "group flex aspect-square w-[104px] flex-col items-center justify-center gap-1.5 rounded-md transition-all duration-200",
                "border-2 border-dashed border-(--accent)/45 bg-(--accent)/[0.07] text-(--accent)",
                "hover:border-(--accent)/80 hover:bg-(--accent)/[0.14] hover:shadow-[0_0_24px_-8px_var(--accent)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0e14]",
                "disabled:pointer-events-none disabled:opacity-40"
            )}
        >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-(--accent)/20 text-(--accent) shadow-inner ring-1 ring-(--accent)/25 transition-all group-hover:scale-105 group-hover:bg-(--accent)/30 group-hover:ring-(--accent)/40">
                {kind === "video" ? (
                    <Video className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                ) : kind === "source" ? (
                    <ScanLine className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                ) : (
                    <ImagePlus className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                )}
            </span>
            <span className="max-w-[92px] text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-(--accent)/95">
                {label}
            </span>
        </button>
        </div>
    );
}

/** Full-width interactive GLB viewer with status bar (single preview pane, no nested inner frame). */
function FormCardModelViewer({
    modelUrl,
    statusSlot
}: {
    modelUrl: string;
    statusSlot: ReactNode;
}) {
    return (
        <div
            className="overflow-hidden rounded-lg border border-(--accent)/30 bg-[#050608]/50 ring-1 ring-(--accent)/20"
            role="region"
            aria-label="Generated 3D model"
        >
            <div className="flex min-w-0 flex-col gap-2 border-b border-(--border)/80 bg-[#080b10]/85 px-3 py-2.5">
                {statusSlot}
            </div>
            <div className="relative aspect-16/10 min-h-[200px] w-full sm:min-h-[280px]">
                <ProductModelPreview
                    key={modelUrl}
                    modelUrl={modelUrl}
                    compact
                    className="absolute inset-0 h-full min-h-0 w-full cursor-grab active:cursor-grabbing"
                />
            </div>
            <p className="border-t border-(--border)/60 px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-(--accent)/85 sm:text-left">
                Interactive · drag to orbit, scroll to zoom
            </p>
        </div>
    );
}

function ProductFormFields({
    register,
    control,
    errors,
    idPrefix,
    showStock,
    mediaSection,
    threeDSection,
    dimensionsSection
}: {
    register: ReturnType<typeof useForm<SellerProductFormValues>>["register"];
    control: ReturnType<typeof useForm<SellerProductFormValues>>["control"];
    errors: ReturnType<typeof useForm<SellerProductFormValues>>["formState"]["errors"];
    idPrefix: string;
    showStock: boolean;
    /** File uploads + thumbnails (images + optional video). */
    mediaSection?: ReactNode;
    /** 2D upload → Fal 3D → preview; persisted on create/save only. */
    threeDSection?: ReactNode;
    /** Shown below 3D card when a 3D model is present (generated or saved). */
    dimensionsSection?: ReactNode;
}) {
    return (
        <>
            <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor={`${idPrefix}-title`} className="text-(--muted)">
                    Product name
                </Label>
                <Input id={`${idPrefix}-title`} className={inputDark} {...register("title")} />
                {errors.title ? (
                    <p className="text-xs text-red-400">{errors.title.message}</p>
                ) : null}
            </div>
            <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor={`${idPrefix}-description`} className="text-(--muted)">
                    Description
                </Label>
                <Textarea
                    id={`${idPrefix}-description`}
                    className={cn(inputDark, "min-h-[100px]")}
                    {...register("description")}
                />
                {errors.description ? (
                    <p className="text-xs text-red-400">{errors.description.message}</p>
                ) : null}
            </div>
            <div className="grid gap-2">
                <Label htmlFor={`${idPrefix}-basePrice`} className="text-(--muted)">
                    Base price (PHP)
                </Label>
                <Input
                    id={`${idPrefix}-basePrice`}
                    type="number"
                    min={1}
                    step={1}
                    className={inputDark}
                    {...register("basePrice", { valueAsNumber: true })}
                />
                {errors.basePrice ? (
                    <p className="text-xs text-red-400">{errors.basePrice.message}</p>
                ) : null}
            </div>
            {showStock ? (
                <div className="grid gap-2">
                    <Label htmlFor={`${idPrefix}-stock`} className="text-(--muted)">
                        Stock quantity
                    </Label>
                    <Input
                        id={`${idPrefix}-stock`}
                        type="number"
                        min={0}
                        step={1}
                        className={inputDark}
                        {...register("stockQuantity", { valueAsNumber: true })}
                    />
                    {errors.stockQuantity ? (
                        <p className="text-xs text-red-400">{errors.stockQuantity.message}</p>
                    ) : null}
                </div>
            ) : (
                <div className="grid gap-2 text-xs text-(--muted)">
                    <span className="font-semibold uppercase tracking-wider text-(--accent)">
                        Made to order
                    </span>
                    <p>
                        Stock is not tracked. Buyers may specify custom colors outside your listed
                        colors.
                    </p>
                </div>
            )}
            <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row sm:items-center sm:gap-6">
                <Controller
                    name="madeToOrder"
                    control={control}
                    render={({ field }) => (
                        <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                            <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-(--border) bg-[#080b10]"
                                checked={field.value}
                                onChange={(e) => field.onChange(e.target.checked)}
                            />
                            Made to order
                        </label>
                    )}
                />
                <Controller
                    name="isFeatured"
                    control={control}
                    render={({ field }) => (
                        <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                            <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-(--border) bg-[#080b10]"
                                checked={field.value}
                                onChange={(e) => field.onChange(e.target.checked)}
                            />
                            Featured listing
                        </label>
                    )}
                />
            </div>
            <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor={`${idPrefix}-colors`} className="text-(--muted)">
                    Available colors
                </Label>
                <Textarea
                    id={`${idPrefix}-colors`}
                    placeholder={"One per line, e.g.\nCarrara white\nNero Marquina"}
                    className={cn(inputDark, "min-h-[72px] font-mono text-xs")}
                    {...register("colorsText")}
                />
                <p className="text-xs text-(--muted)">
                    For made-to-order products, customers can still choose custom colors beyond this
                    list.
                </p>
            </div>
            {mediaSection ? <div className="space-y-4 sm:col-span-2">{mediaSection}</div> : null}
            {threeDSection ? <div className="space-y-4 sm:col-span-2">{threeDSection}</div> : null}
            {dimensionsSection ? (
                <div className="space-y-2 sm:col-span-2">{dimensionsSection}</div>
            ) : null}
        </>
    );
}

export default function SellerListingsPage() {
    const [products, setProducts] = useState<Product[]>([]);
    const [selected, setSelected] = useState<ProductDetail | null>(null);
    const [page, setPage] = useState(1);
    const [showCreatePanel, setShowCreatePanel] = useState(false);
    const [generating3dCreate, setGenerating3dCreate] = useState(false);
    const [generating3dEdit, setGenerating3dEdit] = useState(false);
    const [mediaBusy, setMediaBusy] = useState(false);
    const [createImages, setCreateImages] = useState<CreateImageEntry[]>([]);
    const [createVideo, setCreateVideo] = useState<CreateVideoEntry | null>(null);
    const [editImages, setEditImages] = useState<EditImageEntry[]>([]);
    const [editVideo, setEditVideo] = useState<EditVideoEntry | null>(null);
    const [create3dSource, setCreate3dSource] = useState<Pending3dSource | null>(null);
    const [create3dGlb, setCreate3dGlb] = useState<Pending3dGlb | null>(null);
    const [edit3dSource, setEdit3dSource] = useState<Pending3dSource | null>(null);
    const [edit3dGlb, setEdit3dGlb] = useState<Pending3dGlb | null>(null);

    const createImageInputRef = useRef<HTMLInputElement>(null);
    const createVideoInputRef = useRef<HTMLInputElement>(null);
    const create3dImageInputRef = useRef<HTMLInputElement>(null);
    const editImageInputRef = useRef<HTMLInputElement>(null);
    const editVideoInputRef = useRef<HTMLInputElement>(null);
    const edit3dImageInputRef = useRef<HTMLInputElement>(null);

    const createForm = useForm<SellerProductFormValues>({
        resolver: zodResolver(sellerProductFormSchema),
        defaultValues: defaultFormValues
    });

    const editForm = useForm<SellerProductFormValues>({
        resolver: zodResolver(sellerProductFormSchema),
        defaultValues: defaultFormValues
    });

    const createMadeToOrder = createForm.watch("madeToOrder");
    const editMadeToOrder = editForm.watch("madeToOrder");

    const editModelPreviewUrl = useMemo(() => {
        if (edit3dGlb?.previewUrl) {
            return edit3dGlb.previewUrl;
        }
        const u = selected?.model3dUrl?.trim();
        return u && URL.canParse(u) ? u : "";
    }, [edit3dGlb?.previewUrl, selected?.model3dUrl]);

    useLayoutEffect(() => {
        createForm.setValue("dimensionsRequiredFor3d", !!create3dGlb, { shouldValidate: false });
    }, [create3dGlb, createForm]);

    useLayoutEffect(() => {
        if (!selected) {
            return;
        }
        editForm.setValue("dimensionsRequiredFor3d", !!editModelPreviewUrl, {
            shouldValidate: false
        });
    }, [editModelPreviewUrl, selected, editForm]);

    useEffect(() => {
        if (createMadeToOrder) {
            createForm.setValue("stockQuantity", undefined);
        } else if (createForm.getValues("stockQuantity") === undefined) {
            createForm.setValue("stockQuantity", 0);
        }
    }, [createMadeToOrder, createForm]);

    useEffect(() => {
        if (editMadeToOrder) {
            editForm.setValue("stockQuantity", undefined);
        } else if (editForm.getValues("stockQuantity") === undefined) {
            editForm.setValue("stockQuantity", 0);
        }
    }, [editMadeToOrder, editForm]);

    useEffect(() => {
        let cancelled = false;
        void getSellerProducts().then((response) => {
            if (cancelled) return;
            setProducts(response.data);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    const loadProducts = useCallback(async () => {
        const response = await getSellerProducts();
        setProducts(response.data);
    }, []);

    const openProductForEdit = useCallback(
        async (productId: string) => {
            setShowCreatePanel(false);
            const response = await getSellerProductDetail(productId);
            const detail = response.data;
            setEditImages((prev) => {
                prev.forEach((e) => {
                    if (e.kind === "local") URL.revokeObjectURL(e.preview);
                });
                return detail.media.map((m) => ({
                    kind: "server" as const,
                    key: m.id,
                    mediaId: m.id,
                    url: m.url
                }));
            });
            setEditVideo((prev) => {
                if (prev?.kind === "local") URL.revokeObjectURL(prev.preview);
                const v = detail.videoUrl;
                return v ? { kind: "server" as const, url: v, preview: v } : null;
            });
            setEdit3dSource((prev) => {
                if (prev) URL.revokeObjectURL(prev.preview);
                return null;
            });
            setEdit3dGlb((prev) => {
                if (prev) URL.revokeObjectURL(prev.previewUrl);
                return null;
            });
            setSelected(detail);
            editForm.reset(productDetailToFormValues(detail));
        },
        [editForm]
    );

    const totalPages = Math.max(1, Math.ceil(products.length / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const pageSlice = useMemo(() => {
        const start = (safePage - 1) * PAGE_SIZE;
        return products.slice(start, start + PAGE_SIZE);
    }, [products, safePage]);

    const manifestTotal = useMemo(
        () => products.reduce((sum, p) => sum + p.basePrice, 0),
        [products]
    );
    const publishedCount = useMemo(() => products.filter((p) => p.isPublished).length, [products]);

    function openCreatePanel() {
        setCreateImages((prev) => {
            prev.forEach((i) => URL.revokeObjectURL(i.preview));
            return [];
        });
        setCreateVideo((prev) => {
            if (prev) URL.revokeObjectURL(prev.preview);
            return null;
        });
        setCreate3dSource((prev) => {
            if (prev) URL.revokeObjectURL(prev.preview);
            return null;
        });
        setCreate3dGlb((prev) => {
            if (prev) URL.revokeObjectURL(prev.previewUrl);
            return null;
        });
        setEditImages((prev) => {
            prev.forEach((e) => {
                if (e.kind === "local") URL.revokeObjectURL(e.preview);
            });
            return [];
        });
        setEditVideo((prev) => {
            if (prev?.kind === "local") URL.revokeObjectURL(prev.preview);
            return null;
        });
        setSelected(null);
        setShowCreatePanel(true);
        createForm.reset(defaultFormValues);
    }

    function closeCreatePanel() {
        setCreateImages((prev) => {
            prev.forEach((i) => URL.revokeObjectURL(i.preview));
            return [];
        });
        setCreateVideo((prev) => {
            if (prev) URL.revokeObjectURL(prev.preview);
            return null;
        });
        setCreate3dSource((prev) => {
            if (prev) URL.revokeObjectURL(prev.preview);
            return null;
        });
        setCreate3dGlb((prev) => {
            if (prev) URL.revokeObjectURL(prev.previewUrl);
            return null;
        });
        setShowCreatePanel(false);
    }

    function closeEditPanel() {
        setEditImages((prev) => {
            prev.forEach((e) => {
                if (e.kind === "local") URL.revokeObjectURL(e.preview);
            });
            return [];
        });
        setEditVideo((prev) => {
            if (prev?.kind === "local") URL.revokeObjectURL(prev.preview);
            return null;
        });
        setEdit3dSource((prev) => {
            if (prev) URL.revokeObjectURL(prev.preview);
            return null;
        });
        setEdit3dGlb((prev) => {
            if (prev) URL.revokeObjectURL(prev.previewUrl);
            return null;
        });
        setSelected(null);
    }

    function onCreateImagesPicked(files: FileList | null) {
        if (!files?.length) return;
        const imageFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
        if (!imageFiles.length) return;
        setCreateImages((prev) => {
            const room = Math.max(0, 5 - prev.length);
            if (imageFiles.length > room) {
                toast.info("Maximum of 5 images.");
            }
            const next = [...prev];
            for (const file of imageFiles.slice(0, room)) {
                next.push({
                    key: crypto.randomUUID(),
                    file,
                    preview: URL.createObjectURL(file)
                });
            }
            return next;
        });
    }

    function removeCreateImage(key: string) {
        setCreateImages((prev) => {
            const found = prev.find((i) => i.key === key);
            if (found) URL.revokeObjectURL(found.preview);
            return prev.filter((i) => i.key !== key);
        });
    }

    function onCreateVideoPicked(file: File | null) {
        if (!file) return;
        if (!file.type.startsWith("video/")) {
            toast.error("Please choose a video file.");
            return;
        }
        setCreateVideo((prev) => {
            if (prev) URL.revokeObjectURL(prev.preview);
            return { file, preview: URL.createObjectURL(file) };
        });
    }

    function removeCreateVideo() {
        setCreateVideo((prev) => {
            if (prev) URL.revokeObjectURL(prev.preview);
            return null;
        });
    }

    function onEditImagesPicked(files: FileList | null) {
        if (!files?.length) return;
        const imageFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
        if (!imageFiles.length) return;
        setEditImages((prev) => {
            const room = Math.max(0, 5 - prev.length);
            if (imageFiles.length > room) {
                toast.info("Maximum of 5 images.");
            }
            const next = [...prev];
            for (const file of imageFiles.slice(0, room)) {
                next.push({
                    kind: "local",
                    key: crypto.randomUUID(),
                    file,
                    preview: URL.createObjectURL(file)
                });
            }
            return next;
        });
    }

    function removeEditLocalImage(key: string) {
        setEditImages((prev) => {
            const found = prev.find((e) => e.kind === "local" && e.key === key);
            if (found && found.kind === "local") URL.revokeObjectURL(found.preview);
            return prev.filter((e) => !(e.kind === "local" && e.key === key));
        });
    }

    async function removeEditServerImage(mediaId: string) {
        if (!selected) return;
        setMediaBusy(true);
        try {
            await deleteProductMedia(selected.id, mediaId);
            setEditImages((prev) =>
                prev.filter((e) => e.kind !== "server" || e.mediaId !== mediaId)
            );
            setSelected((s) =>
                s ? { ...s, media: s.media.filter((m) => m.id !== mediaId) } : null
            );
            await loadProducts();
            toast.success("Image removed.");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Remove failed");
        } finally {
            setMediaBusy(false);
        }
    }

    async function removeEditServerVideo() {
        if (!selected) return;
        setMediaBusy(true);
        try {
            await updateProduct(selected.id, { videoUrl: "" });
            setEditVideo(null);
            setSelected((s) => (s ? { ...s, videoUrl: undefined } : null));
            await loadProducts();
            toast.success("Video removed.");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Remove failed");
        } finally {
            setMediaBusy(false);
        }
    }

    function onEditVideoPicked(file: File | null) {
        if (!file) return;
        if (!file.type.startsWith("video/")) {
            toast.error("Please choose a video file.");
            return;
        }
        setEditVideo((prev) => {
            if (prev?.kind === "local") URL.revokeObjectURL(prev.preview);
            return { kind: "local", file, preview: URL.createObjectURL(file) };
        });
    }

    function removeEditLocalVideo() {
        setEditVideo((prev) => {
            if (prev?.kind === "local") URL.revokeObjectURL(prev.preview);
            return null;
        });
    }

    function onCreate3dImagePicked(file: File | null) {
        if (!file || !file.type.startsWith("image/")) {
            if (file) toast.error("Please choose an image file.");
            return;
        }
        setCreate3dSource((prev) => {
            if (prev) URL.revokeObjectURL(prev.preview);
            return { file, preview: URL.createObjectURL(file) };
        });
        setCreate3dGlb((prev) => {
            if (prev) URL.revokeObjectURL(prev.previewUrl);
            return null;
        });
    }

    function removeCreate3dSource() {
        setCreate3dSource((prev) => {
            if (prev) URL.revokeObjectURL(prev.preview);
            return null;
        });
        setCreate3dGlb((prev) => {
            if (prev) URL.revokeObjectURL(prev.previewUrl);
            return null;
        });
    }

    function removeCreate3dGlbDraft() {
        setCreate3dGlb((prev) => {
            if (prev) URL.revokeObjectURL(prev.previewUrl);
            return null;
        });
    }

    function onEdit3dImagePicked(file: File | null) {
        if (!file || !file.type.startsWith("image/")) {
            if (file) toast.error("Please choose an image file.");
            return;
        }
        setEdit3dSource((prev) => {
            if (prev) URL.revokeObjectURL(prev.preview);
            return { file, preview: URL.createObjectURL(file) };
        });
        setEdit3dGlb((prev) => {
            if (prev) URL.revokeObjectURL(prev.previewUrl);
            return null;
        });
    }

    function removeEdit3dSource() {
        setEdit3dSource((prev) => {
            if (prev) URL.revokeObjectURL(prev.preview);
            return null;
        });
        setEdit3dGlb((prev) => {
            if (prev) URL.revokeObjectURL(prev.previewUrl);
            return null;
        });
    }

    function removeEdit3dGlbDraft() {
        setEdit3dGlb((prev) => {
            if (prev) URL.revokeObjectURL(prev.previewUrl);
            return null;
        });
    }

    const runGenerate3dCreate = useCallback(async () => {
        if (!create3dSource) {
            toast.error("Upload a 2D product photo first.");
            return;
        }
        setGenerating3dCreate(true);
        try {
            const b64 = await readFileAsBase64(create3dSource.file);
            const mime = create3dSource.file.type || "image/jpeg";
            const { falGlbUrl } = await imageFileTo3dModel(b64, mime);
            const res = await fetch(falGlbUrl);
            if (!res.ok) {
                throw new Error("Could not download the generated model");
            }
            const blob = await res.blob();
            setCreate3dGlb((prev) => {
                if (prev) URL.revokeObjectURL(prev.previewUrl);
                return { blob, previewUrl: URL.createObjectURL(blob) };
            });
            toast.success(
                "3D model ready — it uploads to your bucket when you create the listing."
            );
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Generation failed");
        } finally {
            setGenerating3dCreate(false);
        }
    }, [create3dSource]);

    const runGenerate3dEdit = useCallback(async () => {
        if (!selected) return;
        if (!edit3dSource) {
            toast.error("Upload a 2D product photo first.");
            return;
        }
        setGenerating3dEdit(true);
        try {
            const b64 = await readFileAsBase64(edit3dSource.file);
            const mime = edit3dSource.file.type || "image/jpeg";
            const { falGlbUrl } = await imageFileTo3dModel(b64, mime);
            const res = await fetch(falGlbUrl);
            if (!res.ok) {
                throw new Error("Could not download the generated model");
            }
            const blob = await res.blob();
            setEdit3dGlb((prev) => {
                if (prev) URL.revokeObjectURL(prev.previewUrl);
                return { blob, previewUrl: URL.createObjectURL(blob) };
            });
            toast.success("3D model ready — it uploads to your bucket when you save.");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Generation failed");
        } finally {
            setGenerating3dEdit(false);
        }
    }, [edit3dSource, selected]);

    async function handleCreate(values: SellerProductFormValues) {
        try {
            const { id } = await createProduct(buildCreatePayload(values));
            for (const img of createImages) {
                await uploadProductImageFile(id, img.file);
            }
            if (createVideo) {
                const videoUrl = await uploadProductVideoFile(id, createVideo.file);
                await updateProduct(id, { videoUrl });
            }
            if (create3dGlb) {
                const modelUrl = await uploadProductModel3dBlob(id, create3dGlb.blob);
                await updateProduct(id, { model3dUrl: modelUrl });
            }
            setCreateImages((prev) => {
                prev.forEach((i) => URL.revokeObjectURL(i.preview));
                return [];
            });
            setCreateVideo((prev) => {
                if (prev) URL.revokeObjectURL(prev.preview);
                return null;
            });
            setCreate3dSource((prev) => {
                if (prev) URL.revokeObjectURL(prev.preview);
                return null;
            });
            setCreate3dGlb((prev) => {
                if (prev) URL.revokeObjectURL(prev.previewUrl);
                return null;
            });
            await loadProducts();
            toast.success("Listing created.");
            setShowCreatePanel(false);
            createForm.reset(defaultFormValues);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Create failed");
        }
    }

    async function handleEditSubmit(values: SellerProductFormValues) {
        if (!selected) return;
        try {
            let videoUrlForPatch = "";
            if (editVideo?.kind === "server") {
                videoUrlForPatch = editVideo.url;
            } else if (editVideo?.kind === "local") {
                if (selected.videoUrl) {
                    await updateProduct(selected.id, { videoUrl: "" });
                }
                videoUrlForPatch = await uploadProductVideoFile(selected.id, editVideo.file);
            }

            for (const entry of editImages) {
                if (entry.kind === "local") {
                    await uploadProductImageFile(selected.id, entry.file);
                }
            }

            let model3dUrlForPatch = (selected.model3dUrl ?? "").trim();
            if (edit3dGlb) {
                model3dUrlForPatch = await uploadProductModel3dBlob(selected.id, edit3dGlb.blob);
            }

            await updateProduct(
                selected.id,
                buildPatchPayload(values, videoUrlForPatch, model3dUrlForPatch)
            );

            setEditImages((prev) => {
                prev.forEach((e) => {
                    if (e.kind === "local") URL.revokeObjectURL(e.preview);
                });
                return [];
            });
            setEditVideo((prev) => {
                if (prev?.kind === "local") URL.revokeObjectURL(prev.preview);
                return null;
            });
            setEdit3dSource((prev) => {
                if (prev) URL.revokeObjectURL(prev.preview);
                return null;
            });
            setEdit3dGlb((prev) => {
                if (prev) URL.revokeObjectURL(prev.previewUrl);
                return null;
            });

            await openProductForEdit(selected.id);
            await loadProducts();
            toast.success("Product updated.");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Update failed");
        }
    }

    async function handlePublishProduct(productId: string) {
        try {
            await publishProduct(productId);
            await loadProducts();
            if (selected?.id === productId) {
                await openProductForEdit(productId);
            }
            toast.success("Published.");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Publish failed");
        }
    }

    async function handleDeleteProduct(productId: string) {
        if (!window.confirm("Delete this product? This cannot be undone.")) {
            return;
        }
        try {
            await deleteProductById(productId);
            if (selected?.id === productId) {
                closeEditPanel();
            }
            await loadProducts();
            toast.success("Product deleted.");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Delete failed");
        }
    }

    return (
        <div className="p-4 md:p-6">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--accent)">
                        Inventory management
                    </p>
                    <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
                        Stone Products
                    </h1>
                    <p className="mt-1 text-sm text-(--muted)">
                        Create slabs, publish listings, and edit specimens.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-2 rounded-lg border border-(--border) bg-(--surface) px-4 py-3 text-right">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-(--muted)">
                            Products value
                        </p>
                        <p className="text-lg font-semibold tabular-nums text-foreground">
                            PHP {manifestTotal.toLocaleString()}
                        </p>
                    </div>
                    <div className="flex items-center gap-2 rounded-lg border border-(--border) bg-(--surface) px-4 py-3 text-right">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-(--muted)">
                            Active products
                        </p>
                        <p className="text-lg font-semibold tabular-nums text-(--accent)">
                            {publishedCount}
                        </p>
                    </div>
                    <Button
                        type="button"
                        onClick={() => (showCreatePanel ? closeCreatePanel() : openCreatePanel())}
                        className={cn(btnPrimary, "ml-2 gap-2")}
                        aria-expanded={showCreatePanel}
                    >
                        <Plus className="h-4 w-4 shrink-0" aria-hidden />
                        {showCreatePanel ? "Close" : "New product"}
                    </Button>
                </div>
            </div>

            {showCreatePanel ? (
                <div className="mb-6 rounded-lg border border-(--border) bg-(--surface) p-5">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <h2 className="border-l-2 border-(--accent) pl-3 text-sm font-semibold uppercase tracking-wide text-foreground">
                                New product
                            </h2>
                            <p className="mt-2 text-xs text-(--muted)">
                                Create a draft listing, then publish when ready.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={closeCreatePanel}
                            className="rounded-md p-1.5 text-(--muted) transition-colors hover:bg-(--surface-elevated) hover:text-foreground"
                            aria-label="Close create form"
                        >
                            <X className="h-4 w-4" aria-hidden />
                        </button>
                    </div>
                    <form
                        className="mt-4 grid gap-4 sm:grid-cols-2"
                        onSubmit={createForm.handleSubmit(handleCreate)}
                    >
                        <ProductFormFields
                            register={createForm.register}
                            control={createForm.control}
                            errors={createForm.formState.errors}
                            idPrefix="create"
                            showStock={!createMadeToOrder}
                            mediaSection={
                                <>
                                    <div className="grid gap-2">
                                        <Label className="text-(--muted)">
                                            Product images (max 5)
                                        </Label>
                                        <div className="flex flex-wrap items-end gap-3">
                                            {createImages.map((img) => (
                                                <MediaThumb
                                                    key={img.key}
                                                    previewUrl={img.preview}
                                                    disabled={createForm.formState.isSubmitting}
                                                    removeLabel="Remove image"
                                                    onRemove={() => removeCreateImage(img.key)}
                                                />
                                            ))}
                                            {createImages.length < 5 ? (
                                                <>
                                                    <input
                                                        ref={createImageInputRef}
                                                        type="file"
                                                        accept="image/*"
                                                        multiple
                                                        className="hidden"
                                                        onChange={(e) => {
                                                            onCreateImagesPicked(e.target.files);
                                                            e.target.value = "";
                                                        }}
                                                    />
                                                    <MediaAddTile
                                                        kind="image"
                                                        label="Add photos"
                                                        ariaLabel="Add product images"
                                                        disabled={createForm.formState.isSubmitting}
                                                        onClick={() =>
                                                            createImageInputRef.current?.click()
                                                        }
                                                    />
                                                </>
                                            ) : null}
                                        </div>
                                    </div>
                                    <div className="grid gap-2">
                                        <Label className="text-(--muted)">
                                            Product video (optional, one file)
                                        </Label>
                                        <div className="flex flex-wrap items-end gap-3">
                                            {createVideo ? (
                                                <MediaThumb
                                                    video
                                                    previewUrl={createVideo.preview}
                                                    disabled={createForm.formState.isSubmitting}
                                                    removeLabel="Remove video"
                                                    onRemove={removeCreateVideo}
                                                />
                                            ) : null}
                                            {!createVideo ? (
                                                <>
                                                    <input
                                                        ref={createVideoInputRef}
                                                        type="file"
                                                        accept="video/*"
                                                        className="hidden"
                                                        onChange={(e) => {
                                                            onCreateVideoPicked(
                                                                e.target.files?.[0] ?? null
                                                            );
                                                            e.target.value = "";
                                                        }}
                                                    />
                                                    <MediaAddTile
                                                        kind="video"
                                                        label="Add video"
                                                        ariaLabel="Add product video"
                                                        disabled={createForm.formState.isSubmitting}
                                                        onClick={() =>
                                                            createVideoInputRef.current?.click()
                                                        }
                                                    />
                                                </>
                                            ) : null}
                                        </div>
                                    </div>
                                </>
                            }
                            threeDSection={
                                <div className="space-y-4 rounded-md border border-(--border) bg-[#080b10]/60 p-4">
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-wider text-(--accent)">
                                            3D model (Fal AI)
                                        </p>
                                        <p className="mt-1 text-xs text-(--muted)">
                                            Upload a clear, well-lit 2D photo. Wait for generation
                                            to finish before creating the listing.
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap items-end gap-3">
                                        {create3dSource ? (
                                            <MediaThumb
                                                previewUrl={create3dSource.preview}
                                                disabled={
                                                    createForm.formState.isSubmitting ||
                                                    generating3dCreate
                                                }
                                                removeLabel="Remove source photo"
                                                onRemove={removeCreate3dSource}
                                            />
                                        ) : null}
                                        {!create3dSource ? (
                                            <>
                                                <input
                                                    ref={create3dImageInputRef}
                                                    type="file"
                                                    accept="image/*"
                                                    className="hidden"
                                                    onChange={(e) => {
                                                        onCreate3dImagePicked(
                                                            e.target.files?.[0] ?? null
                                                        );
                                                        e.target.value = "";
                                                    }}
                                                />
                                                <MediaAddTile
                                                    kind="source"
                                                    label="2D source"
                                                    ariaLabel="Upload 2D photo for 3D generation"
                                                    disabled={
                                                        createForm.formState.isSubmitting ||
                                                        generating3dCreate
                                                    }
                                                    onClick={() =>
                                                        create3dImageInputRef.current?.click()
                                                    }
                                                />
                                            </>
                                        ) : null}
                                        {create3dSource ? (
                                            <Button
                                                type="button"
                                                variant="outline"
                                                className={cn(btnOutline, "gap-2")}
                                                disabled={
                                                    createForm.formState.isSubmitting ||
                                                    generating3dCreate
                                                }
                                                onClick={() => void runGenerate3dCreate()}
                                            >
                                                {generating3dCreate ? (
                                                    <Loader2
                                                        className="h-4 w-4 animate-spin"
                                                        aria-hidden
                                                    />
                                                ) : null}
                                                Generate 3D
                                            </Button>
                                        ) : null}
                                    </div>
                                    {create3dGlb ? (
                                        <FormCardModelViewer
                                            modelUrl={create3dGlb.previewUrl}
                                            statusSlot={
                                                <>
                                                    <p className="text-xs text-(--muted)">
                                                        Generated model preview — not saved to
                                                        storage until you create the listing.
                                                    </p>
                                                    <button
                                                        type="button"
                                                        className="w-fit text-xs font-medium text-red-400 hover:text-red-300"
                                                        onClick={removeCreate3dGlbDraft}
                                                    >
                                                        Remove draft model
                                                    </button>
                                                </>
                                            }
                                        />
                                    ) : null}
                                </div>
                            }
                            dimensionsSection={
                                create3dGlb ? (
                                    <div className="grid gap-2">
                                        <Label
                                            htmlFor="create-dimensions"
                                            className="text-(--muted)"
                                        >
                                            Available dimensions (3D picker){" "}
                                            <span className="text-red-400" aria-hidden>
                                                *
                                            </span>
                                        </Label>
                                        <Textarea
                                            id="create-dimensions"
                                            required
                                            placeholder={
                                                "One per line, e.g.\n60 × 60 cm\n80 × 80 cm"
                                            }
                                            className={cn(
                                                inputDark,
                                                "min-h-[72px] font-mono text-xs"
                                            )}
                                            {...createForm.register("dimensionsText")}
                                        />
                                        {createForm.formState.errors.dimensionsText ? (
                                            <p className="text-xs text-red-400">
                                                {createForm.formState.errors.dimensionsText.message}
                                            </p>
                                        ) : null}
                                        <p className="text-xs text-(--muted)">
                                            Required when you have generated a 3D model for this
                                            listing.
                                        </p>
                                    </div>
                                ) : null
                            }
                        />
                        <div className="flex flex-wrap items-end gap-2 sm:col-span-2">
                            <Button
                                type="submit"
                                disabled={createForm.formState.isSubmitting}
                                className={btnPrimary}
                            >
                                {createForm.formState.isSubmitting ? "Creating…" : "Create product"}
                            </Button>
                        </div>
                    </form>
                </div>
            ) : null}

            {selected ? (
                <div className="mb-6 rounded-lg border border-(--border) bg-(--surface) p-5">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-3">
                            <h2 className="border-l-2 border-(--accent) pl-3 text-sm font-semibold uppercase tracking-wide text-foreground">
                                Edit specimen
                            </h2>
                            <Link
                                href={`/seller/listings/${selected.id}`}
                                className="text-xs font-medium text-(--accent) underline-offset-2 hover:underline"
                            >
                                Full page editor
                            </Link>
                        </div>
                        <button
                            type="button"
                            onClick={closeEditPanel}
                            className="rounded-md p-1.5 text-(--muted) transition-colors hover:bg-(--surface-elevated) hover:text-foreground"
                            aria-label="Close edit form"
                        >
                            <X className="h-4 w-4" aria-hidden />
                        </button>
                    </div>
                    <form
                        className="mt-4 grid gap-4 sm:grid-cols-2"
                        onSubmit={editForm.handleSubmit(handleEditSubmit)}
                    >
                        <ProductFormFields
                            register={editForm.register}
                            control={editForm.control}
                            errors={editForm.formState.errors}
                            idPrefix="edit"
                            showStock={!editMadeToOrder}
                            mediaSection={
                                <>
                                    <div className="grid gap-2">
                                        <Label className="text-(--muted)">
                                            Product images (max 5)
                                        </Label>
                                        <div className="flex flex-wrap items-end gap-3">
                                            {editImages.map((entry) =>
                                                entry.kind === "server" ? (
                                                    <MediaThumb
                                                        key={entry.key}
                                                        previewUrl={entry.url}
                                                        disabled={
                                                            editForm.formState.isSubmitting ||
                                                            mediaBusy
                                                        }
                                                        removeLabel="Remove image"
                                                        onRemove={() =>
                                                            void removeEditServerImage(
                                                                entry.mediaId
                                                            )
                                                        }
                                                    />
                                                ) : (
                                                    <MediaThumb
                                                        key={entry.key}
                                                        previewUrl={entry.preview}
                                                        disabled={
                                                            editForm.formState.isSubmitting ||
                                                            mediaBusy
                                                        }
                                                        removeLabel="Remove image"
                                                        onRemove={() =>
                                                            removeEditLocalImage(entry.key)
                                                        }
                                                    />
                                                )
                                            )}
                                            {editImages.length < 5 ? (
                                                <>
                                                    <input
                                                        ref={editImageInputRef}
                                                        type="file"
                                                        accept="image/*"
                                                        multiple
                                                        className="hidden"
                                                        onChange={(e) => {
                                                            onEditImagesPicked(e.target.files);
                                                            e.target.value = "";
                                                        }}
                                                    />
                                                    <MediaAddTile
                                                        kind="image"
                                                        label="Add photos"
                                                        ariaLabel="Add product images"
                                                        disabled={
                                                            editForm.formState.isSubmitting ||
                                                            mediaBusy
                                                        }
                                                        onClick={() =>
                                                            editImageInputRef.current?.click()
                                                        }
                                                    />
                                                </>
                                            ) : null}
                                        </div>
                                        <p className="text-xs text-(--muted)">
                                            New images upload when you save. Remove saved images
                                            immediately.
                                        </p>
                                    </div>
                                    <div className="grid gap-2">
                                        <Label className="text-(--muted)">
                                            Product video (one file)
                                        </Label>
                                        <div className="flex flex-wrap items-end gap-3">
                                            {editVideo ? (
                                                <MediaThumb
                                                    video
                                                    previewUrl={editVideo.preview}
                                                    disabled={
                                                        editForm.formState.isSubmitting || mediaBusy
                                                    }
                                                    removeLabel="Remove video"
                                                    onRemove={() => {
                                                        if (editVideo.kind === "server") {
                                                            void removeEditServerVideo();
                                                        } else {
                                                            removeEditLocalVideo();
                                                        }
                                                    }}
                                                />
                                            ) : null}
                                            {!editVideo ? (
                                                <>
                                                    <input
                                                        ref={editVideoInputRef}
                                                        type="file"
                                                        accept="video/*"
                                                        className="hidden"
                                                        onChange={(e) => {
                                                            onEditVideoPicked(
                                                                e.target.files?.[0] ?? null
                                                            );
                                                            e.target.value = "";
                                                        }}
                                                    />
                                                    <MediaAddTile
                                                        kind="video"
                                                        label="Add video"
                                                        ariaLabel="Add product video"
                                                        disabled={
                                                            editForm.formState.isSubmitting ||
                                                            mediaBusy
                                                        }
                                                        onClick={() =>
                                                            editVideoInputRef.current?.click()
                                                        }
                                                    />
                                                </>
                                            ) : null}
                                        </div>
                                    </div>
                                </>
                            }
                            threeDSection={
                                <div className="space-y-4 rounded-md border border-(--border) bg-[#080b10]/60 p-4">
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-wider text-(--accent)">
                                            3D model (Fal AI)
                                        </p>
                                        <p className="mt-1 text-xs text-(--muted)">
                                            Upload a 2D photo and generate a new GLB, or keep the
                                            saved model below. New models upload to your bucket only
                                            when you click{" "}
                                            <span className="text-foreground">Save changes</span>.
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap items-end gap-3">
                                        {edit3dSource ? (
                                            <MediaThumb
                                                previewUrl={edit3dSource.preview}
                                                disabled={
                                                    editForm.formState.isSubmitting ||
                                                    mediaBusy ||
                                                    generating3dEdit
                                                }
                                                removeLabel="Remove source photo"
                                                onRemove={removeEdit3dSource}
                                            />
                                        ) : null}
                                        {!edit3dSource ? (
                                            <>
                                                <input
                                                    ref={edit3dImageInputRef}
                                                    type="file"
                                                    accept="image/*"
                                                    className="hidden"
                                                    onChange={(e) => {
                                                        onEdit3dImagePicked(
                                                            e.target.files?.[0] ?? null
                                                        );
                                                        e.target.value = "";
                                                    }}
                                                />
                                                <MediaAddTile
                                                    kind="source"
                                                    label="2D source"
                                                    ariaLabel="Upload 2D photo for 3D generation"
                                                    disabled={
                                                        editForm.formState.isSubmitting ||
                                                        mediaBusy ||
                                                        generating3dEdit
                                                    }
                                                    onClick={() =>
                                                        edit3dImageInputRef.current?.click()
                                                    }
                                                />
                                            </>
                                        ) : null}
                                        {edit3dSource ? (
                                            <Button
                                                type="button"
                                                variant="outline"
                                                className={cn(btnOutline, "gap-2")}
                                                disabled={
                                                    editForm.formState.isSubmitting ||
                                                    mediaBusy ||
                                                    generating3dEdit
                                                }
                                                onClick={() => void runGenerate3dEdit()}
                                            >
                                                {generating3dEdit ? (
                                                    <Loader2
                                                        className="h-4 w-4 animate-spin"
                                                        aria-hidden
                                                    />
                                                ) : null}
                                                Generate 3D
                                            </Button>
                                        ) : null}
                                    </div>
                                    {editModelPreviewUrl ? (
                                        <FormCardModelViewer
                                            modelUrl={editModelPreviewUrl}
                                            statusSlot={
                                                edit3dGlb ? (
                                                    <>
                                                        <p className="text-xs text-(--muted)">
                                                            New generated model — replaces the saved
                                                            GLB when you save.
                                                        </p>
                                                        <button
                                                            type="button"
                                                            className="w-fit text-xs font-medium text-red-400 hover:text-red-300"
                                                            onClick={removeEdit3dGlbDraft}
                                                        >
                                                            Remove draft model
                                                        </button>
                                                    </>
                                                ) : (
                                                    <p className="text-xs text-(--muted)">
                                                        Saved listing model — upload a new 2D photo
                                                        and generate to replace on save.
                                                    </p>
                                                )
                                            }
                                        />
                                    ) : null}
                                </div>
                            }
                            dimensionsSection={
                                editModelPreviewUrl ? (
                                    <div className="grid gap-2">
                                        <Label htmlFor="edit-dimensions" className="text-(--muted)">
                                            Available dimensions (3D picker){" "}
                                            <span className="text-red-400" aria-hidden>
                                                *
                                            </span>
                                        </Label>
                                        <Textarea
                                            id="edit-dimensions"
                                            required
                                            placeholder={
                                                "One per line, e.g.\n60 × 60 cm\n80 × 80 cm"
                                            }
                                            className={cn(
                                                inputDark,
                                                "min-h-[72px] font-mono text-xs"
                                            )}
                                            {...editForm.register("dimensionsText")}
                                        />
                                        {editForm.formState.errors.dimensionsText ? (
                                            <p className="text-xs text-red-400">
                                                {editForm.formState.errors.dimensionsText.message}
                                            </p>
                                        ) : null}
                                        <p className="text-xs text-(--muted)">
                                            Required while this listing has a 3D model (generated or
                                            saved).
                                        </p>
                                    </div>
                                ) : null
                            }
                        />
                        <div className="flex flex-wrap gap-2 sm:col-span-2">
                            <Button type="submit" className={btnPrimary}>
                                Save changes
                            </Button>
                            {!selected.isPublished ? (
                                <Button
                                    type="button"
                                    variant="outline"
                                    className={btnOutline}
                                    onClick={() => void handlePublishProduct(selected.id)}
                                >
                                    Publish
                                </Button>
                            ) : null}
                            <Button
                                type="button"
                                variant="outline"
                                className="border-red-500/40 text-red-300 hover:bg-red-950/30"
                                onClick={() => void handleDeleteProduct(selected.id)}
                            >
                                Delete
                            </Button>
                        </div>
                    </form>
                </div>
            ) : null}

            <div className="overflow-hidden rounded-lg border border-(--border) bg-(--surface)">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] border-collapse">
                        <thead className="bg-[#080b10]">
                            <tr>
                                <th className={tableHead}>Title</th>
                                <th className={cn(tableHead, "whitespace-nowrap")}>Fulfillment</th>
                                <th className={cn(tableHead, "whitespace-nowrap")}>Price</th>
                                <th className={cn(tableHead, "whitespace-nowrap")}>Status</th>
                                <th className={cn(tableHead, "whitespace-nowrap text-right")}>
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {pageSlice.map((product) => (
                                <tr
                                    key={product.id}
                                    className="border-t border-(--border) hover:bg-(--surface-elevated)/40"
                                >
                                    <td className={cn(tableCell, "max-w-[220px]")}>
                                        <span className="line-clamp-2 font-medium text-foreground">
                                            {product.title}
                                        </span>
                                        {product.isFeatured ? (
                                            <span className="mt-1 inline-block rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-400 ring-1 ring-amber-500/40">
                                                Featured
                                            </span>
                                        ) : null}
                                    </td>
                                    <td
                                        className={cn(
                                            tableCell,
                                            "whitespace-nowrap text-xs text-(--muted)"
                                        )}
                                    >
                                        {product.madeToOrder === true ? (
                                            "Made to order"
                                        ) : (
                                            <span>Stock: {product.stockQuantity ?? 0}</span>
                                        )}
                                    </td>
                                    <td
                                        className={cn(
                                            tableCell,
                                            "whitespace-nowrap tabular-nums text-foreground"
                                        )}
                                    >
                                        PHP {product.basePrice.toLocaleString()}
                                    </td>
                                    <td className={tableCell}>
                                        <span
                                            className={cn(
                                                "inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                                                product.isPublished
                                                    ? "bg-(--accent)/20 text-(--accent)"
                                                    : "bg-(--border) text-(--muted)"
                                            )}
                                        >
                                            {product.isPublished ? "Published" : "Draft"}
                                        </span>
                                    </td>
                                    <td className={cn(tableCell, "text-right")}>
                                        <div className="flex flex-wrap justify-end gap-1.5">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className={cn(btnOutline, "h-8 text-xs")}
                                                onClick={() => void openProductForEdit(product.id)}
                                            >
                                                Edit
                                            </Button>
                                            {!product.isPublished ? (
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    className={cn(btnOutline, "h-8 text-xs")}
                                                    onClick={() =>
                                                        void handlePublishProduct(product.id)
                                                    }
                                                >
                                                    Publish
                                                </Button>
                                            ) : null}
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="h-8 border-red-500/40 text-xs text-red-300 hover:bg-red-950/30"
                                                onClick={() => void handleDeleteProduct(product.id)}
                                            >
                                                Delete
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {products.length === 0 ? (
                    <p className="border-t border-(--border) px-4 py-8 text-center text-sm text-(--muted)">
                        No products yet. Use &quot;New product&quot; to create your first listing.
                    </p>
                ) : null}
                <AdminTablePagination
                    page={safePage}
                    totalPages={totalPages}
                    total={products.length}
                    limit={PAGE_SIZE}
                    onPageChange={setPage}
                    disabled={false}
                />
            </div>
        </div>
    );
}
