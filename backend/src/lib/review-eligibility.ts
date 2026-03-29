import { db } from "./store";
import type { ProductReviewRecord } from "../types/domain";

/** Minimum time between posting or updating a review for the same product. */
const REVIEW_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

export function buyerHasDeliveredProduct(buyerId: string, productId: string): boolean {
    for (const line of db.orderLineItems.values()) {
        if (line.productId !== productId) {
            continue;
        }
        const order = db.orders.get(line.orderId);
        if (order?.buyerId === buyerId && order.status === "delivered") {
            return true;
        }
    }
    return false;
}

export function findBuyerProductReview(
    productId: string,
    buyerId: string
): ProductReviewRecord | undefined {
    return [...db.productReviews.values()].find(
        (r) => r.productId === productId && r.buyerId === buyerId
    );
}

export function reviewCooldownEndsAt(review: ProductReviewRecord): Date {
    return new Date(new Date(review.updatedAt).getTime() + REVIEW_COOLDOWN_MS);
}

export function isOutsideReviewCooldown(review: ProductReviewRecord | undefined): boolean {
    if (!review) {
        return true;
    }
    return Date.now() >= reviewCooldownEndsAt(review).getTime();
}

export function getReviewEligibilityForBuyer(
    buyerId: string,
    productId: string
): {
    hasCompletedPurchase: boolean;
    eligible: boolean;
    cooldownEndsAt: string | null;
} {
    const hasCompletedPurchase = buyerHasDeliveredProduct(buyerId, productId);
    const existing = findBuyerProductReview(productId, buyerId);
    const cooldownOk = isOutsideReviewCooldown(existing);
    const eligible = hasCompletedPurchase && cooldownOk;
    const cooldownEndsAt =
        existing && !cooldownOk ? reviewCooldownEndsAt(existing).toISOString() : null;
    return { hasCompletedPurchase, eligible, cooldownEndsAt };
}
