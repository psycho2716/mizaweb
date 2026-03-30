"use client";

import { useParams } from "next/navigation";
import { SellerOrderFulfillmentClient } from "@/components/seller/seller-order-fulfillment-client";

export default function SellerOrderDetailPage() {
    const params = useParams();
    const raw = params.id;
    const orderId =
        typeof raw === "string" ? raw : Array.isArray(raw) ? (raw[0] ?? "") : "";

    return <SellerOrderFulfillmentClient orderId={orderId} />;
}
