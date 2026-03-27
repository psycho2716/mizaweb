"use client";

import { AlertCircle, Clock, RefreshCw, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    createVerificationUploadUrl,
    getSellerVerificationStatus,
    resubmitSellerVerification,
    submitSellerVerification
} from "@/lib/api/endpoints";
import { toSellerVerificationUiPhase, type SellerVerificationUiPhase } from "@/types";

async function uploadPermitAndGetUrl(file: File): Promise<string> {
    const target = await createVerificationUploadUrl(file.name);
    try {
        const putRes = await fetch(target.uploadUrl, {
            method: "PUT",
            body: file,
            headers: { "Content-Type": file.type || "application/octet-stream" }
        });
        if (!putRes.ok) {
            console.warn("Permit upload PUT returned non-OK; continuing with signed URL for submit.");
        }
    } catch {
        console.warn("Permit upload PUT failed; continuing with signed URL for submit.");
    }
    return target.uploadUrl;
}

export function SellerVerificationBanner() {
    const [phase, setPhase] = useState<SellerVerificationUiPhase>("loading");
    const [rejectionReason, setRejectionReason] = useState<string | undefined>();
    const [file, setFile] = useState<File | null>(null);
    const [note, setNote] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const load = useCallback(() => {
        setPhase("loading");
        getSellerVerificationStatus()
            .then((result) => {
                setPhase(toSellerVerificationUiPhase(result.status));
                setRejectionReason(
                    result.status === "rejected" ? result.rejectionReason : undefined
                );
            })
            .catch(() => {
                setPhase("error");
            });
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    async function handleSubmitResubmit(isResubmit: boolean) {
        if (!file) {
            toast.error("Choose a PDF or image file.");
            return;
        }
        const okType = file.type === "application/pdf" || file.type.startsWith("image/");
        if (!okType) {
            toast.error("File must be a PDF or image.");
            return;
        }
        setSubmitting(true);
        try {
            const permitFileUrl = await uploadPermitAndGetUrl(file);
            if (isResubmit) {
                await resubmitSellerVerification(permitFileUrl, note.trim() || undefined);
                toast.success("New document submitted for review.");
            } else {
                await submitSellerVerification(permitFileUrl, note.trim() || undefined);
                toast.success("Verification submitted.");
            }
            setFile(null);
            setNote("");
            load();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Submission failed");
        } finally {
            setSubmitting(false);
        }
    }

    if (phase === "loading") {
        return (
            <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-center text-xs text-zinc-600">
                Checking verification status…
            </div>
        );
    }

    if (phase === "approved") {
        return null;
    }

    if (phase === "error") {
        return (
            <div
                className="border-b border-red-200 bg-red-50/80 px-4 py-3"
                role="alert"
            >
                <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm text-red-900">
                        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
                        <span>Could not load verification status.</span>
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="border-red-300 bg-white"
                        onClick={() => load()}
                    >
                        <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                        Retry
                    </Button>
                </div>
            </div>
        );
    }

    if (phase === "pending") {
        return (
            <div
                className="border-b border-amber-200 bg-amber-50/90 px-4 py-3"
                role="status"
            >
                <div className="mx-auto flex max-w-6xl items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-900">
                        <Clock className="h-5 w-5" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1 space-y-1 text-sm text-amber-950">
                        <p className="font-semibold">Verification pending</p>
                        <p className="text-amber-950/90">
                            Your business permit is being reviewed. You cannot publish listings until
                            an administrator approves your account.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    if (phase === "rejected") {
        return (
            <div className="border-b border-red-200 bg-red-50/90 px-4 py-4" role="alert">
                <div className="mx-auto grid max-w-6xl gap-4">
                    <div className="flex items-start gap-3">
                        <XCircle className="h-6 w-6 shrink-0 text-red-700" aria-hidden />
                        <div className="min-w-0 space-y-1 text-sm text-red-950">
                            <p className="font-semibold">Verification not approved</p>
                            {rejectionReason ? (
                                <p>
                                    <span className="font-medium">Admin note: </span>
                                    {rejectionReason}
                                </p>
                            ) : (
                                <p>Please submit a new legal business document for review.</p>
                            )}
                            <p className="text-red-900/90">
                                Upload a clear PDF or image of your business permit below.
                            </p>
                        </div>
                    </div>
                    <div className="grid max-w-md gap-3 sm:pl-9">
                        <div className="space-y-1.5">
                            <Label htmlFor="seller-banner-permit">Business permit (PDF or image)</Label>
                            <Input
                                id="seller-banner-permit"
                                type="file"
                                accept=".pdf,image/*"
                                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="seller-banner-note">Note to reviewer (optional)</Label>
                            <Textarea
                                id="seller-banner-note"
                                rows={2}
                                placeholder="Corrections or context for this submission"
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                            />
                        </div>
                        <Button
                            type="button"
                            disabled={submitting}
                            onClick={() => void handleSubmitResubmit(true)}
                            className="w-fit bg-red-900 hover:bg-red-800"
                        >
                            {submitting ? "Submitting…" : "Submit new document"}
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    /* unsubmitted */
    return (
        <div className="border-b border-amber-200 bg-amber-50/90 px-4 py-4" role="status">
            <div className="mx-auto grid max-w-6xl gap-4">
                <div className="flex items-start gap-3">
                    <AlertCircle className="h-6 w-6 shrink-0 text-amber-800" aria-hidden />
                    <div className="min-w-0 space-y-1 text-sm text-amber-950">
                        <p className="font-semibold">Verification required</p>
                        <p>
                            Submit a legal business permit (PDF or image) to sell on this marketplace.
                        </p>
                    </div>
                </div>
                <div className="grid max-w-md gap-3 sm:pl-9">
                    <div className="space-y-1.5">
                        <Label htmlFor="seller-banner-permit-new">Business permit (PDF or image)</Label>
                        <Input
                            id="seller-banner-permit-new"
                            type="file"
                            accept=".pdf,image/*"
                            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="seller-banner-note-new">Note (optional)</Label>
                        <Textarea
                            id="seller-banner-note-new"
                            rows={2}
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                        />
                    </div>
                    <Button
                        type="button"
                        disabled={submitting}
                        onClick={() => void handleSubmitResubmit(false)}
                        className="w-fit"
                    >
                        {submitting ? "Submitting…" : "Submit for verification"}
                    </Button>
                </div>
            </div>
        </div>
    );
}
