/** One row the seller defines (defaults + any custom lines) before confirming. */
export interface OrderQualityChecklistItem {
  id: string;
  label: string;
  checked: boolean;
}

/** Saved when the seller confirms; buyer sees this attestation on the order. */
export interface OrderQualityChecklist {
  items: OrderQualityChecklistItem[];
}

export interface Order {
  id: string;
  buyerId: string;
  sellerId: string;
  status: "created" | "confirmed" | "processing" | "shipped" | "delivered" | "cancelled";
  paymentMethod: "cash" | "online";
  paymentReference?: string;
  paymentStatus: "pending" | "paid";
  receiptStatus: "none" | "submitted" | "resubmit_requested" | "approved";
  receiptRequestNote?: string;
  totalAmount: number;
  createdAt: string;
  receiptProofUrl?: string;
  sellerPaymentMethodId?: string;
  estimatedDeliveryStartAt?: string;
  estimatedDeliveryEndAt?: string;
  estimatedDeliveryRangeDisplay?: string;
  shippingRecipientName?: string;
  shippingAddressLine?: string;
  shippingCity?: string;
  shippingPostalCode?: string;
  shippingContactNumber?: string;
  deliveryNotes?: string;
  /** Seller-provided shipment info (optional); shown to the buyer. */
  fulfillmentCarrierName?: string;
  fulfillmentTrackingNumber?: string;
  fulfillmentNotes?: string;
  cancellationReason?: string;
  qualityChecklist?: OrderQualityChecklist;
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
  /** Snapshot of option name at purchase; present on order lines from checkout onward. */
  optionLabel?: string;
}

/** One buyer-selected spec row for cart / checkout UI (option name + chosen value). */
export interface CartSelectionDisplayRow {
  label: string;
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
  /** Digits-only mobile or landline for delivery contact. Omitted in older session entries. */
  contactNumber?: string;
  addressLine: string;
  city: string;
  postalCode: string;
  /** Optional buyer notes for the seller (access, timing, landmarks). */
  deliveryNotes?: string;
  estimatedDeliveryRange: string;
  /** Legacy session entries may still include this field. */
  country?: string;
}

/** One line on the printable / saveable order receipt (buyer confirmation). */
export interface OrderReceiptPrintLine {
  title: string;
  quantity: number;
  unitPricePeso: number;
  lineTotalPeso: number;
  /** Customization rows, e.g. "Dimensions: 200 x 450 cm". */
  optionLines: string[];
}

/** Delivery block on the printable receipt. */
export interface OrderReceiptShipTo {
  fullName: string;
  email: string;
  contactNumber?: string;
  addressLine: string;
  city: string;
  postalCode: string;
  country?: string;
  deliveryNotes?: string;
}

/** Data passed to `openOrderReceiptPrintWindow` (Mizaweb-styled document). */
export interface OrderReceiptPrintPayload {
  appName: string;
  orderId: string;
  /** ISO timestamp from the order. */
  orderPlacedAtIso: string;
  paymentMethodLabel: string;
  paymentStatusLabel: string;
  orderStatusLabel: string;
  estimatedDelivery: string | null;
  lines: OrderReceiptPrintLine[];
  subtotalPeso: number;
  /** Human-readable shipping row (e.g. "With seller" or a peso amount). */
  shippingDisplay: string;
  totalPeso: number;
  shipTo: OrderReceiptShipTo | null;
  /** Short thank-you / craft line under totals. */
  footerNote: string;
}
