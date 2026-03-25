export type OrderStatus = "pending" | "confirmed" | "shipped" | "completed" | "cancelled";

export interface OrderSummary {
  id: string;
  order_status: OrderStatus;
  total_amount: number;
}

