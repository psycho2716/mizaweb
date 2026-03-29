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
  receiptProofUrl?: string;
  sellerPaymentMethodId?: string;
}

/** One row in POST /checkout when paying online (one per seller in the cart). */
export interface CheckoutOnlinePaymentLine {
  sellerId: string;
  sellerPaymentMethodId: string;
  receiptProofUrl: string;
}

/** Chosen listing options for a cart or order line (matches API `selections`). */
export interface CartItemSelection {
  optionId: string;
  value: string;
}

/** One row in an order; product details loaded separately for display. */
export interface OrderLineItem {
  id: string;
  orderId: string;
  productId: string;
  quantity: number;
  createdAt: string;
  selections?: CartItemSelection[];
}

export interface OrderMessage {
  id: string;
  orderId: string;
  senderId: string;
  body: string;
  createdAt: string;
}

/** Saved in sessionStorage after checkout for the confirmation screen. */
export interface CheckoutSuccessDisplayMeta {
  fullName: string;
  email: string;
  addressLine: string;
  city: string;
  postalCode: string;
  /** Optional buyer notes for the seller (access, timing, landmarks). */
  deliveryNotes?: string;
  estimatedDeliveryRange: string;
  /** Legacy session entries may still include this field. */
  country?: string;
}
