export interface Order {
  id: string;
  buyerId: string;
  sellerId: string;
  status: "created" | "confirmed" | "processing" | "shipped" | "delivered";
  paymentMethod: "cash" | "online";
  paymentReference?: string;
  totalAmount: number;
  createdAt: string;
}

export interface OrderMessage {
  id: string;
  orderId: string;
  senderId: string;
  body: string;
  createdAt: string;
}
