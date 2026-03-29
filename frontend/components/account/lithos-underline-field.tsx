"use client";

import { cn } from "@/lib/utils";
import type { LithosUnderlineFieldProps } from "@/types";

export function LithosUnderlineField({
    label,
    className,
    id,
    readOnly,
    ...rest
}: LithosUnderlineFieldProps) {
    return (
        <div className={cn("space-y-1.5", className)}>
            <label
                htmlFor={id}
                className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-(--muted)"
            >
                {label}
            </label>
            <input
                id={id}
                readOnly={readOnly}
                className={cn(
                    "h-9 w-full border-0 border-b border-white/20 bg-transparent px-0 text-sm text-foreground outline-none transition-colors placeholder:text-(--muted)/50",
                    "focus:border-(--accent) focus:ring-0",
                    readOnly && "cursor-default border-white/10 text-(--muted)"
                )}
                {...rest}
            />
        </div>
    );
}
