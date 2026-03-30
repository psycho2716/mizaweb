import { findBuyerProductReview } from "./review-eligibility";
import { db } from "./store";
import { rewriteLocalSupabaseUrl } from "./supabase-asset-url";

export function firstProductThumbnailUrl(productId: string): string | null {
    const media = [...db.productMedia.values()]
        .filter((m) => m.productId === productId)
        .sort((a, b) => a.id.localeCompare(b.id));
    const raw = media[0]?.url ?? null;
    if (!raw) {
        return null;
    }
    return rewriteLocalSupabaseUrl(raw) ?? raw;
}

export interface BuyerReviewSubmittedRow {
    id: string;
    productId: string;
    rating: number;
    body: string;
    createdAt: string;
    updatedAt: string;
    productTitle: string;
    thumbnailUrl: string | null;
}

export interface BuyerReviewPendingRow {
    productId: string;
    productTitle: string;
    thumbnailUrl: string | null;
    /** From the qualifying delivered order (for sorting / display). */
    orderReferenceAt: string;
}

export function buildBuyerReviewsDashboard(buyerId: string): {
    submitted: BuyerReviewSubmittedRow[];
    pending: BuyerReviewPendingRow[];
    stats: {
        submittedCount: number;
        pendingCount: number;
        uniqueProductsRated: number;
    };
} {
    const submittedRaw = [...db.productReviews.values()].filter((r) => r.buyerId === buyerId);
    const submitted: BuyerReviewSubmittedRow[] = submittedRaw
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map((r) => {
            const p = db.products.get(r.productId);
            return {
                id: r.id,
                productId: r.productId,
                rating: r.rating,
                body: r.body,
                createdAt: r.createdAt,
                updatedAt: r.updatedAt,
                productTitle: p?.title ?? "Product",
                thumbnailUrl: firstProductThumbnailUrl(r.productId)
            };
        });

    const pendingByProduct = new Map<string, string>();
    for (const line of db.orderLineItems.values()) {
        const order = db.orders.get(line.orderId);
        if (!order || order.buyerId !== buyerId || order.status !== "delivered") {
            continue;
        }
        const product = db.products.get(line.productId);
        if (!product?.isPublished) {
            continue;
        }
        if (findBuyerProductReview(line.productId, buyerId)) {
            continue;
        }
        const prev = pendingByProduct.get(line.productId);
        if (!prev || order.createdAt > prev) {
            pendingByProduct.set(line.productId, order.createdAt);
        }
    }

    const pending: BuyerReviewPendingRow[] = [...pendingByProduct.entries()]
        .map(([productId, orderReferenceAt]) => {
            const p = db.products.get(productId);
            return {
                productId,
                productTitle: p?.title ?? "Product",
                thumbnailUrl: firstProductThumbnailUrl(productId),
                orderReferenceAt
            };
        })
        .sort((a, b) => b.orderReferenceAt.localeCompare(a.orderReferenceAt));

    return {
        submitted,
        pending,
        stats: {
            submittedCount: submitted.length,
            pendingCount: pending.length,
            uniqueProductsRated: new Set(submitted.map((s) => s.productId)).size
        }
    };
}
