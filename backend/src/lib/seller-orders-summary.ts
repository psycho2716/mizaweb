import type { OrderRecord } from "../types/domain";
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

function buyerDisplayName(buyerId: string): string {
    const buyer = db.users.get(buyerId);
    const name = buyer?.fullName?.trim();
    if (name) {
        return name;
    }
    if (buyer?.email) {
        return buyer.email;
    }
    return buyerId;
}

export interface SellerOrderSummaryRow {
    id: string;
    buyerId: string;
    buyerDisplayName: string;
    status: OrderRecord["status"];
    paymentMethod: OrderRecord["paymentMethod"];
    paymentStatus: OrderRecord["paymentStatus"];
    totalAmount: number;
    createdAt: string;
    itemCount: number;
    previewProductTitle: string;
    previewThumbnailUrl: string | null;
}

export function buildSellerOrdersSummary(sellerId: string): SellerOrderSummaryRow[] {
    const orders = [...db.orders.values()]
        .filter((o) => o.sellerId === sellerId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return orders.map((order) => {
        const lines = [...db.orderLineItems.values()].filter((l) => l.orderId === order.id);
        const itemCount = lines.reduce((s, l) => s + l.quantity, 0);
        const firstLine = lines[0];
        const product = firstLine ? db.products.get(firstLine.productId) : undefined;
        return {
            id: order.id,
            buyerId: order.buyerId,
            buyerDisplayName: buyerDisplayName(order.buyerId),
            status: order.status,
            paymentMethod: order.paymentMethod,
            paymentStatus: order.paymentStatus,
            totalAmount: order.totalAmount,
            createdAt: order.createdAt,
            itemCount,
            previewProductTitle: product?.title ?? (firstLine ? "Product" : "—"),
            previewThumbnailUrl: firstLine
                ? firstProductThumbnailUrl(firstLine.productId)
                : null
        };
    });
}
