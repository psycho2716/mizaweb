"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProfileAvatarEditorProps } from "@/types";

export function ProfileAvatarEditor({
    imageUrl,
    initials,
    onFileSelected,
    inputId,
    size = "lg",
    className,
    "aria-label": ariaLabel = "Change profile photo"
}: ProfileAvatarEditorProps) {
    const dim = size === "lg" ? "h-28 w-28 md:h-32 md:w-32" : "h-20 w-20";
    const [over, setOver] = useState(false);
    const [imageFailed, setImageFailed] = useState(false);

    useEffect(() => {
        setImageFailed(false);
    }, [imageUrl]);

    const onDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            setOver(false);
            const f = e.dataTransfer.files[0];
            if (f?.type.startsWith("image/")) {
                onFileSelected(f);
            }
        },
        [onFileSelected]
    );

    return (
        <div className={cn("relative shrink-0", className)}>
            <label
                htmlFor={inputId}
                onDragEnter={(e) => {
                    e.preventDefault();
                    setOver(true);
                }}
                onDragLeave={(e) => {
                    e.preventDefault();
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                        setOver(false);
                    }
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDrop}
                className={cn(
                    "group relative block cursor-pointer rounded-2xl p-[2px] transition-all duration-200",
                    "bg-gradient-to-br from-(--accent)/45 via-white/12 to-transparent",
                    over && "from-(--accent) via-(--accent)/55 shadow-[0_0_28px_rgba(34,199,243,0.25)]"
                )}
                aria-label={ariaLabel}
            >
                <div
                    className={cn(
                        "relative overflow-hidden rounded-[14px] border border-white/10 bg-[#0c0f14] shadow-[0_0_32px_rgba(0,0,0,0.45)]",
                        dim
                    )}
                >
                    {imageUrl && !imageFailed ? (
                        <img
                            src={imageUrl}
                            alt=""
                            className="h-full w-full object-cover"
                            onError={() => setImageFailed(true)}
                        />
                    ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-gradient-to-b from-[#12151c] to-[#080a0e]">
                            <span className="text-2xl font-bold tracking-tight text-(--accent) md:text-3xl">
                                {initials}
                            </span>
                            <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-(--muted)">
                                Photo
                            </span>
                        </div>
                    )}
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/45">
                        <span className="scale-90 opacity-0 transition group-hover:scale-100 group-hover:opacity-100">
                            <span className="rounded-lg border border-white/25 bg-black/65 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wider text-white">
                                {imageUrl ? "Replace" : "Add photo"}
                            </span>
                        </span>
                    </div>
                </div>
                <span
                    className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-xl border border-(--accent)/50 bg-[#0b0e14] text-(--accent) shadow-[0_0_24px_rgba(34,199,243,0.35)]"
                    aria-hidden
                >
                    <Pencil className="h-4 w-4" />
                </span>
                <input
                    id={inputId}
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) {
                            onFileSelected(f);
                        }
                        e.target.value = "";
                    }}
                />
            </label>
        </div>
    );
}
