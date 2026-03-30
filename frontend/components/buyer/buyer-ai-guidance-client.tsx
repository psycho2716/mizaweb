"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { BuyerAIGuidanceClientProps, BuyerGuidanceCategory } from "@/types";
import { BuyerGuidanceOnboardingClient } from "@/components/buyer/buyer-guidance-onboarding-client";
import { getAiGuidance } from "@/lib/api/endpoints";

const LS_CATEGORY_KEY = "miza_buyer_guidance_category";
const LS_ONBOARDED_KEY = "miza_buyer_guidance_onboarded";

const PRESET_CATEGORIES: readonly BuyerGuidanceCategory[] = [
    "Kitchen",
    "Decor",
    "Gift",
    "Outdoor & Garden",
    "All / no preference"
];

export function BuyerAIGuidanceClient({ enabled, product }: BuyerAIGuidanceClientProps) {
    const categoryDefault = useMemo(() => "All / no preference" as BuyerGuidanceCategory, []);

    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        setMounted(true);
    }, []);

    const [selectedCategory, setSelectedCategory] = useState<BuyerGuidanceCategory>(categoryDefault);
    const [onboardingOpen, setOnboardingOpen] = useState(false);
    const [hasOnboarded, setHasOnboarded] = useState(false);

    const [loading, setLoading] = useState(false);
    const [answer, setAnswer] = useState<string | null>(null);

    const closeOnboarding = useCallback(() => {
        setOnboardingOpen(false);
    }, []);

    const requestGuidance = useCallback(async () => {
        if (!enabled) {
            return;
        }

        const effectiveCategory = selectedCategory.trim()
            ? selectedCategory.trim()
            : (categoryDefault as string);

        setLoading(true);
        try {
            const prompt = [
                `Buyer category preference: ${effectiveCategory}.`,
                `Current product: ${product.title}.`,
                `Product description: ${product.description}`,
                "",
                "Give 3-5 short, buyer-friendly guidance points to help the buyer make an informed decision.",
                "Focus on what to check before buying (finish/quality, care expectations, and delivery/lead-time considerations).",
                "Use plain language.",
            ].join(" ");

            const res = await getAiGuidance(prompt);
            setAnswer(res.answer);
        } catch (error) {
            const message = error instanceof Error ? error.message : "Failed to get AI guidance";
            toast.error(message);
        } finally {
            setLoading(false);
        }
    }, [enabled, product.description, product.title, selectedCategory]);

    useEffect(() => {
        if (!enabled) {
            return;
        }

        try {
            const onboardedRaw = window.localStorage.getItem(LS_ONBOARDED_KEY);
            const onboarded = onboardedRaw === "true";

            const rawCategory = window.localStorage.getItem(LS_CATEGORY_KEY) ?? "";
            const storedCategory = rawCategory.trim();

            setHasOnboarded(onboarded);
            setSelectedCategory(storedCategory ? storedCategory : categoryDefault);

            if (!onboarded) {
                setOnboardingOpen(true);
            }
        } catch {
            setHasOnboarded(false);
            setOnboardingOpen(true);
        }
    }, [enabled, categoryDefault]);

    useEffect(() => {
        if (!enabled) {
            return;
        }
        if (!hasOnboarded) {
            return;
        }
        if (answer) {
            return;
        }

        void requestGuidance();
    }, [enabled, hasOnboarded, answer, requestGuidance]);

    const handleSaveAndContinue = useCallback(() => {
        try {
            const trimmed = selectedCategory.trim();
            window.localStorage.setItem(LS_CATEGORY_KEY, trimmed ? trimmed : categoryDefault);
            window.localStorage.setItem(LS_ONBOARDED_KEY, "true");
        } catch {
            // localStorage may be blocked; UI still proceeds
        }
        // Clear so the effect can re-trigger automatic generation.
        setAnswer(null);
        setHasOnboarded(true);
        closeOnboarding();
    }, [closeOnboarding, requestGuidance, selectedCategory]);

    const handleSkip = useCallback(() => {
        setSelectedCategory(categoryDefault);
        try {
            window.localStorage.setItem(LS_CATEGORY_KEY, categoryDefault);
            window.localStorage.setItem(LS_ONBOARDED_KEY, "true");
        } catch {
            // ignore
        }
        setAnswer(null);
        setHasOnboarded(true);
        closeOnboarding();
    }, [categoryDefault, closeOnboarding, requestGuidance]);

    if (!enabled || !mounted) {
        return null;
    }

    return (
        <div className="rounded-xl border border-(--border) bg-[#080b10]/60 p-5 ring-1 ring-white/4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--accent)">
                AI guidance
            </p>
            <h3 className="mt-1 text-lg font-bold text-foreground">Support for informed decisions</h3>
            <p className="mt-2 text-xs leading-relaxed text-(--muted)">
                Tailored to your preference: <span className="text-foreground/90">{selectedCategory}</span>
                . It highlights what to verify before you buy.
            </p>

            <div className="mt-4 space-y-3">
                {loading ? (
                    <div className="rounded-lg border border-(--border)/60 bg-[#050608]/40 p-4">
                        <p className="text-sm font-semibold text-(--muted)">Thinking…</p>
                        <p className="mt-1 text-xs text-(--muted)">Generating guidance for this product.</p>
                    </div>
                ) : answer ? (
                    <div className="rounded-lg border border-(--border)/60 bg-[#050608]/40 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wider text-(--muted)">
                            Guidance
                        </p>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                            {answer}
                        </p>
                    </div>
                ) : (
                    <div className="rounded-lg border border-(--border)/60 bg-[#050608]/40 p-4">
                        <p className="text-sm font-semibold text-(--muted)">Preparing guidance…</p>
                        <p className="mt-1 text-xs text-(--muted)">
                            A short suggestion is being generated for this product.
                        </p>
                    </div>
                )}
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Button
                    type="button"
                    variant="outline"
                    className="border-(--border) bg-transparent hover:border-(--accent)/35"
                    onClick={() => setOnboardingOpen(true)}
                >
                    Change preference
                </Button>
            </div>

            <BuyerGuidanceOnboardingClient
                open={onboardingOpen}
                selectedCategory={selectedCategory}
                onSelectCategory={(c) => setSelectedCategory(c)}
                onSaveAndContinue={handleSaveAndContinue}
                onSkip={handleSkip}
            />
        </div>
    );
}

