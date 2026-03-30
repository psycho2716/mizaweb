import type { Order } from "@/types";

/** Plain-language order status labels for seller-facing UI. */
export const SELLER_ORDER_STATUS_LABEL: Record<Order["status"], string> = {
    created: "Awaiting your confirmation",
    confirmed: "Confirmed",
    processing: "Being prepared",
    shipped: "Shipped",
    delivered: "Delivered",
    cancelled: "Cancelled"
};

const ENUM_FRIENDLY: Record<string, string> = {
    // Receipt / proof of payment
    none: "Not sent yet",
    submitted: "Received",
    resubmit_requested: "Please send again",
    approved: "Approved",
    // Payment
    pending: "Awaiting confirmation",
    paid: "Confirmed",
    cash: "Cash",
    online: "Online payment"
};

/** Human-readable labels for order payment / receipt fields (avoids raw enum text). */
export function formatSellerEnumLabel(value: string): string {
    if (ENUM_FRIENDLY[value]) {
        return ENUM_FRIENDLY[value]!;
    }
    return value
        .split("_")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(" ");
}
