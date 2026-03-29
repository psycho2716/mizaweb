"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ImageOff, ImagePlus, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LithosImageUploaderProps } from "@/types";

export function LithosImageUploader({
    id,
    title,
    hint,
    accept = "image/*",
    onFileSelected,
    previewUrl,
    layout,
    disabled,
    className
}: LithosImageUploaderProps) {
    const [dragOver, setDragOver] = useState(false);
    /** Local object URL so preview works before a remote signed/public URL loads. */
    const [blobUrl, setBlobUrl] = useState<string | null>(null);
    const [remotePreviewFailed, setRemotePreviewFailed] = useState(false);
    const blobUrlRef = useRef<string | null>(null);

    useEffect(() => {
        blobUrlRef.current = blobUrl;
    }, [blobUrl]);

    useEffect(() => {
        setRemotePreviewFailed(false);
    }, [previewUrl]);

    /** After upload, parent sets `previewUrl`; drop blob once remote image loads. */
    useEffect(() => {
        if (!previewUrl || !blobUrl) return;
        const img = new Image();
        let cancelled = false;
        img.onload = () => {
            if (cancelled) return;
            setBlobUrl((prev) => {
                if (prev) URL.revokeObjectURL(prev);
                return null;
            });
        };
        img.onerror = () => {
            /* Keep blob preview if remote URL is broken (e.g. private bucket + bad sign). */
        };
        img.src = previewUrl;
        return () => {
            cancelled = true;
        };
    }, [previewUrl, blobUrl]);

    useEffect(() => {
        return () => {
            const b = blobUrlRef.current;
            if (b) {
                URL.revokeObjectURL(b);
                blobUrlRef.current = null;
            }
        };
    }, []);

    const pick = useCallback(
        (file: File | undefined) => {
            if (!file || disabled) return;
            if (!file.type.startsWith("image/")) return;
            setBlobUrl((prev) => {
                if (prev) URL.revokeObjectURL(prev);
                return URL.createObjectURL(file);
            });
            onFileSelected(file);
        },
        [disabled, onFileSelected]
    );

    const onDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            setDragOver(false);
            pick(e.dataTransfer.files[0]);
        },
        [pick]
    );

    const isBanner = layout === "banner";

    const remoteSrc =
        previewUrl && !blobUrl && !remotePreviewFailed ? previewUrl : undefined;
    const showBlob = Boolean(blobUrl);
    const showRemote = Boolean(remoteSrc);
    const hasPreview = showBlob || showRemote;

    return (
        <div className={cn("space-y-2", className)}>
            <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-(--accent)">
                        {title}
                    </p>
                    {hint ? (
                        <p className="mt-0.5 max-w-lg text-[11px] leading-relaxed text-(--muted)">
                            {hint}
                        </p>
                    ) : null}
                </div>
            </div>

            <label
                htmlFor={id}
                onDragEnter={(e) => {
                    e.preventDefault();
                    if (!disabled) setDragOver(true);
                }}
                onDragLeave={(e) => {
                    e.preventDefault();
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                        setDragOver(false);
                    }
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDrop}
                className={cn(
                    "group relative flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed transition-all duration-200",
                    "border-white/[0.12] bg-gradient-to-br from-[#0f131a] via-[#0a0d12] to-[#080b10]",
                    "shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
                    !disabled &&
                        "hover:border-(--accent)/45 hover:shadow-[0_0_32px_rgba(34,199,243,0.12)]",
                    dragOver && !disabled && "border-(--accent)/60 shadow-[0_0_40px_rgba(34,199,243,0.18)]",
                    disabled && "pointer-events-none cursor-not-allowed opacity-50",
                    isBanner ? "min-h-[132px] md:min-h-[160px]" : "min-h-[118px] py-5"
                )}
            >
                {hasPreview && isBanner ? (
                    <>
                        {showBlob ? (
                            <img
                                src={blobUrl ?? undefined}
                                alt=""
                                className="absolute inset-0 z-0 h-full w-full object-cover"
                            />
                        ) : null}
                        {showRemote ? (
                            <img
                                src={remoteSrc}
                                alt=""
                                className="absolute inset-0 z-0 h-full w-full object-cover"
                                onError={() => setRemotePreviewFailed(true)}
                            />
                        ) : null}
                        <div
                            className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-t from-[#050608]/95 via-[#050608]/25 to-transparent"
                            aria-hidden
                        />
                    </>
                ) : null}

                {hasPreview && !isBanner ? (
                    <div className="absolute right-3 top-3 z-[2] h-14 w-14 overflow-hidden rounded-lg border border-white/20 shadow-lg bg-black/40">
                        {showBlob ? (
                            <img
                                src={blobUrl ?? undefined}
                                alt=""
                                className="h-full w-full object-cover"
                            />
                        ) : null}
                        {showRemote ? (
                            <img
                                src={remoteSrc}
                                alt=""
                                className="h-full w-full object-cover"
                                onError={() => setRemotePreviewFailed(true)}
                            />
                        ) : null}
                        {previewUrl && !showBlob && remotePreviewFailed ? (
                            <div
                                className="flex h-full w-full items-center justify-center text-(--muted)"
                                title="Could not load image preview"
                            >
                                <ImageOff className="h-6 w-6 opacity-70" aria-hidden />
                            </div>
                        ) : null}
                    </div>
                ) : null}

                <div
                    className={cn(
                        "relative z-[2] flex flex-col items-center justify-center gap-2 px-4 py-5 text-center",
                        hasPreview && isBanner &&
                            "py-10 opacity-0 transition-opacity duration-200 group-hover:opacity-100",
                        hasPreview && !isBanner && "pr-20"
                    )}
                >
                    <span
                        className={cn(
                            "flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-black/30 text-(--accent) backdrop-blur-sm transition group-hover:border-(--accent)/35 group-hover:bg-(--accent)/10",
                            isBanner && hasPreview && "bg-black/55"
                        )}
                    >
                        {isBanner ? (
                            <ImagePlus className="h-5 w-5" aria-hidden />
                        ) : (
                            <Upload className="h-5 w-5" aria-hidden />
                        )}
                    </span>
                    <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-foreground">
                        {hasPreview && isBanner ? "Click or drag to replace" : "Drag a photo here or click to choose"}
                    </span>
                    <span className="text-[10px] text-(--muted)">PNG, JPG, or WebP · about 12MB max</span>
                </div>

                <input
                    id={id}
                    type="file"
                    accept={accept}
                    disabled={disabled}
                    className="sr-only"
                    onChange={(e) => pick(e.target.files?.[0])}
                />
            </label>
        </div>
    );
}
