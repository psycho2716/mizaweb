import type { VerificationUploadTarget } from "@/types";

/** Same bucket as backend `SUPABASE_VERIFICATION_BUCKET` for buyer payment receipts. */
export const BUYER_PAYMENT_RECEIPT_BUCKET = "verification-docs";

/**
 * Canonical URL for order/checkout payloads (path-extractable by the API).
 * Do not use signed upload URLs here.
 */
export function canonicalPaymentReceiptUrlFromUploadTarget(target: VerificationUploadTarget): string {
    const trimmed = target.publicUrl?.trim();
    if (trimmed) {
        return trimmed;
    }
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
    if (!base) {
        throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured");
    }
    const encodedPath = target.path.split("/").map(encodeURIComponent).join("/");
    return `${base}/storage/v1/object/public/${BUYER_PAYMENT_RECEIPT_BUCKET}/${encodedPath}`;
}
