import type { Order } from "@/types";

export const SELLER_ORDER_STATUS_LABEL: Record<Order["status"], string> = {
  created: "PENDING CONFIRMATION",
  confirmed: "CONFIRMED",
  processing: "PROCESSING",
  shipped: "IN TRANSIT",
  delivered: "DELIVERED",
};

/** Uppercase with underscores as spaces (payment / receipt enums). */
export function formatSellerEnumLabel(value: string): string {
  return value.replace(/_/g, " ").toUpperCase();
}
