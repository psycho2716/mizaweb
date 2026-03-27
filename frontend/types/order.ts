export interface Order {
  id: string;
  buyerId: string;
  sellerId: string;
  status: "created" | "confirmed" | "processing" | "shipped" | "delivered";
  paymentMethod: "cash" | "online";
  paymentReference?: string;
  paymentStatus: "pending" | "paid";
  receiptStatus: "none" | "submitted" | "resubmit_requested" | "approved";
  receiptRequestNote?: string;
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
