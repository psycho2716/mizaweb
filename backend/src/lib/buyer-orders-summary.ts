import type { CartItemSelection, OrderQualityChecklist, OrderRecord } from "../types/domain";
import { db } from "./store";
import { rewriteLocalSupabaseUrl } from "./supabase-asset-url";

function firstProductThumbnailUrl(productId: string): string | null {
    const media = [...db.productMedia.values()]
        .filter((m) => m.productId === productId)
        .sort((a, b) => a.id.localeCompare(b.id));
    const raw = media[0]?.url ?? null;
    if (!raw) {
        return null;
    }
    return rewriteLocalSupabaseUrl(raw) ?? raw;
}

export interface BuyerOrderLineSummaryRow {
    id: string;
    productId: string;
    quantity: number;
    productTitle: string;
    thumbnailUrl: string | null;
    selections: CartItemSelection[];
}

export interface BuyerOrderSummaryRow {
    id: string;
    sellerId: string;
    status: OrderRecord["status"];
    paymentMethod: OrderRecord["paymentMethod"];
    paymentStatus: OrderRecord["paymentStatus"];
    totalAmount: number;
    createdAt: string;
    itemCount: number;
    previewProductTitle: string;
    previewThumbnailUrl: string | null;
    lineItems: BuyerOrderLineSummaryRow[];
    estimatedDeliveryStartAt?: string;
    estimatedDeliveryEndAt?: string;
    estimatedDeliveryRangeDisplay?: string;
    shippingRecipientName?: string;
    shippingAddressLine?: string;
    shippingCity?: string;
    shippingPostalCode?: string;
    shippingContactNumber?: string;
    deliveryNotes?: string;
    fulfillmentCarrierName?: string;
    fulfillmentTrackingNumber?: string;
    fulfillmentNotes?: string;
    cancellationReason?: string;
    qualityChecklist?: OrderQualityChecklist;
    receiptStatus: OrderRecord["receiptStatus"];
    receiptRequestNote?: string;
}

export function buildBuyerOrdersSummary(buyerId: string): BuyerOrderSummaryRow[] {
    const orders = [...db.orders.values()]
        .filter((o) => o.buyerId === buyerId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return orders.map((order) => {
        const lines = [...db.orderLineItems.values()].filter((l) => l.orderId === order.id);
        const itemCount = lines.reduce((s, l) => s + l.quantity, 0);
        const firstLine = lines[0];
        const product = firstLine ? db.products.get(firstLine.productId) : undefined;
        const lineItems: BuyerOrderLineSummaryRow[] = lines.map((line) => {
            const p = db.products.get(line.productId);
            const selections = Array.isArray(line.selections) ? line.selections : [];
            return {
                id: line.id,
                productId: line.productId,
                quantity: line.quantity,
                productTitle: p?.title ?? "Product",
                thumbnailUrl: firstProductThumbnailUrl(line.productId),
                selections
            };
        });
        return {
            id: order.id,
            sellerId: order.sellerId,
            status: order.status,
            paymentMethod: order.paymentMethod,
            paymentStatus: order.paymentStatus,
            totalAmount: order.totalAmount,
            createdAt: order.createdAt,
            itemCount,
            previewProductTitle: product?.title ?? (firstLine ? "Product" : "—"),
            previewThumbnailUrl: firstLine
                ? firstProductThumbnailUrl(firstLine.productId)
                : null,
            lineItems,
            ...(order.estimatedDeliveryStartAt
                ? { estimatedDeliveryStartAt: order.estimatedDeliveryStartAt }
                : {}),
            ...(order.estimatedDeliveryEndAt
                ? { estimatedDeliveryEndAt: order.estimatedDeliveryEndAt }
                : {}),
            ...(order.estimatedDeliveryRangeDisplay
                ? { estimatedDeliveryRangeDisplay: order.estimatedDeliveryRangeDisplay }
                : {}),
            ...(order.shippingRecipientName
                ? { shippingRecipientName: order.shippingRecipientName }
                : {}),
            ...(order.shippingAddressLine ? { shippingAddressLine: order.shippingAddressLine } : {}),
            ...(order.shippingCity ? { shippingCity: order.shippingCity } : {}),
            ...(order.shippingPostalCode ? { shippingPostalCode: order.shippingPostalCode } : {}),
            ...(order.shippingContactNumber
                ? { shippingContactNumber: order.shippingContactNumber }
                : {}),
            ...(order.deliveryNotes ? { deliveryNotes: order.deliveryNotes } : {}),
            ...(order.fulfillmentCarrierName?.trim()
                ? { fulfillmentCarrierName: order.fulfillmentCarrierName.trim() }
                : {}),
            ...(order.fulfillmentTrackingNumber?.trim()
                ? { fulfillmentTrackingNumber: order.fulfillmentTrackingNumber.trim() }
                : {}),
            ...(order.fulfillmentNotes?.trim() ? { fulfillmentNotes: order.fulfillmentNotes.trim() } : {}),
            ...(order.cancellationReason ? { cancellationReason: order.cancellationReason } : {}),
            ...(order.qualityChecklist ? { qualityChecklist: order.qualityChecklist } : {}),
            receiptStatus: order.receiptStatus,
            ...(order.receiptRequestNote
                ? { receiptRequestNote: order.receiptRequestNote }
                : {})
        };
    });
}
