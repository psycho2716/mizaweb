"use client";

import { Box, Image as ImageIcon, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProductHeroMediaMode, ProductViewModeToggleProps } from "@/types";

const MODE_LABEL: Record<ProductHeroMediaMode, string> = {
    image: "Image",
    "3d": "3D",
    video: "Video"
};

function ModeIcon({ mode }: { mode: ProductHeroMediaMode }) {
    if (mode === "image") {
        return <ImageIcon className="h-4 w-4 shrink-0 opacity-90" strokeWidth={2} aria-hidden />;
    }
    if (mode === "3d") {
        return <Box className="h-4 w-4 shrink-0 opacity-90" strokeWidth={2} aria-hidden />;
    }
    return <Play className="h-4 w-4 shrink-0 opacity-90" strokeWidth={2} aria-hidden />;
}

/**
 * Lithos-style pill segmented control: recessed track, sliding highlight with
 * vertical accent gradient + soft glow (theme --accent).
 */
export function ProductViewModeToggle({ modes, active, onSelect, className }: ProductViewModeToggleProps) {
    const count = modes.length;
    const activeIndex = Math.max(0, modes.indexOf(active));

    if (count < 2) {
        return null;
    }

    return (
        <div
            className={cn(
                "relative w-full rounded-full border border-white/[0.07] bg-[#0e1218] p-1 shadow-[inset_0_2px_10px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.04)]",
                className
            )}
            role="tablist"
            aria-label="Choose product media"
        >
            <span
                aria-hidden
                className={cn(
                    "pointer-events-none absolute bottom-1 top-1 left-1 rounded-full",
                    "bg-[linear-gradient(180deg,#5dd8f8_0%,var(--accent)_42%,#0d8fb8_100%)]",
                    "shadow-[0_0_18px_rgba(34,199,243,0.55),0_0_36px_rgba(34,199,243,0.18),0_-1px_0_rgba(255,255,255,0.35)_inset,0_1px_0_rgba(0,0,0,0.25)_inset]",
                    "motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)]"
                )}
                style={{
                    width: `calc((100% - 8px) / ${count})`,
                    transform: `translateX(calc(${activeIndex} * 100%))`
                }}
            />
            <div
                className={cn(
                    "relative z-10 grid gap-0",
                    count === 2 && "grid-cols-2",
                    count === 3 && "grid-cols-3"
                )}
            >
                {modes.map((mode) => {
                    const isOn = active === mode;
                    return (
                        <button
                            key={mode}
                            type="button"
                            role="tab"
                            aria-selected={isOn}
                            onClick={() => onSelect(mode)}
                            className={cn(
                                "flex min-h-11 items-center justify-center gap-2 rounded-full py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] transition-colors duration-300 motion-reduce:transition-none",
                                isOn ? "text-[#031018]" : "text-foreground/75 hover:text-foreground"
                            )}
                        >
                            <ModeIcon mode={mode} />
                            {MODE_LABEL[mode]}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
