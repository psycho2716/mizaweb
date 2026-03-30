"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import type { BuyerGuidanceCategory, BuyerGuidanceOnboardingModalProps } from "@/types";

const PRESET_CATEGORIES: readonly BuyerGuidanceCategory[] = [
    "Kitchen",
    "Decor",
    "Gift",
    "Outdoor & Garden",
    "All / no preference"
];

export function BuyerGuidanceOnboardingClient({
    open,
    selectedCategory,
    onSelectCategory,
    onSaveAndContinue,
    onSkip
}: BuyerGuidanceOnboardingModalProps) {
    const presetOptions = useMemo(() => PRESET_CATEGORIES, []);

    const isPreset = presetOptions.includes(selectedCategory);
    const OTHER_VALUE = "__custom__";
    const selectValue = isPreset ? selectedCategory : OTHER_VALUE;

    if (!open) {
        return null;
    }

    return (
        <div
            className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Buyer AI guidance onboarding"
        >
            <div className="w-full max-w-lg rounded-xl border border-(--border) bg-[#080b10]/95 p-6 ring-1 ring-white/5 shadow-[0_0_60px_rgba(0,0,0,0.55)]">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--accent)">
                    Quick setup
                </p>
                <h2 className="mt-1 text-xl font-bold text-foreground">Tailor AI guidance to you</h2>
                <p className="mt-2 text-sm text-(--muted)">
                    We will use your preference to highlight what matters most when you shop.
                </p>

                <div className="mt-5 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-(--muted)">
                        Preferred product category/type
                    </p>
                    <select
                        className="h-11 w-full rounded-md border border-(--border) bg-[#050608] px-3 text-sm text-foreground focus-visible:border-(--accent)/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/25"
                        value={selectValue}
                        onChange={(e) => {
                            const next = e.target.value;
                            if (next === OTHER_VALUE) {
                                onSelectCategory("");
                                return;
                            }
                            onSelectCategory(next);
                        }}
                    >
                        {presetOptions.map((c) => (
                            <option key={c} value={c}>
                                {c}
                            </option>
                        ))}
                        <option value={OTHER_VALUE}>Other (type your own)</option>
                    </select>

                    {!isPreset ? (
                        <input
                            type="text"
                            value={selectedCategory}
                            onChange={(e) => onSelectCategory(e.target.value)}
                            placeholder="Type what you prefer (e.g., matte kitchen stones, modern decor, etc.)"
                            className="h-11 w-full rounded-md border border-(--border) bg-[#050608] px-3 text-sm text-foreground placeholder:text-(--muted) focus-visible:border-(--accent)/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/25"
                        />
                    ) : null}
                </div>

                <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                    <Button
                        type="button"
                        variant="outline"
                        className="bg-transparent"
                        onClick={() => onSkip()}
                    >
                        Not now
                    </Button>
                    <Button
                        type="button"
                        className="bg-(--accent) text-[#050608] hover:bg-(--accent)/90"
                        onClick={() => onSaveAndContinue()}
                    >
                        Save & get guidance
                    </Button>
                </div>

                <p className="mt-4 text-xs text-(--muted)">
                    You can change this anytime (it is saved for this browser).
                </p>
            </div>
        </div>
    );
}

