export type UserRole = "buyer" | "seller" | "admin";

export type VerificationStatus = "unsubmitted" | "pending" | "approved" | "rejected";

export interface AuthUser {
    id: string;
    email: string;
    role: UserRole;
    fullName?: string;
    /** Avatar / portrait URL (auth user_metadata in Supabase). */
    profileImageUrl?: string;
    /** Digits-only contact for orders and delivery (buyer user_metadata). */
    contactNumber?: string;
    /** Default shipping street line (buyer user_metadata). */
    shippingAddressLine?: string;
    shippingCity?: string;
    /** Digits-only postal / ZIP (buyer user_metadata). */
    shippingPostalCode?: string;
    /** Account cannot sign in or use the API (admin suspend / auth ban). */
    suspended?: boolean;
}

export interface SellerProfile {
    sellerId: string;
    businessName: string;
    contactNumber: string;
    address: string;
    /** WGS84 latitude from map pin (optional for legacy rows). */
    shopLatitude?: number;
    /** WGS84 longitude from map pin (optional for legacy rows). */
    shopLongitude?: number;
    profileImageUrl?: string;
    storeBackgroundUrl?: string;
}

export interface SellerPaymentMethod {
    id: string;
    sellerId: string;
    methodName: string;
    accountName: string;
    accountNumber: string;
    qrImageUrl?: string;
}

export interface ProductRecord {
    id: string;
    sellerId: string;
    title: string;
    description: string;
    basePrice: number;
    isPublished: boolean;
    model3dUrl?: string;
    /** When true, item is produced to order; stock_quantity is ignored. */
    madeToOrder: boolean;
    /** Units available when not made-to-order. */
    stockQuantity?: number;
    isFeatured: boolean;
    /** Single marketing / demo video URL. */
    videoUrl?: string;
}

export type SellerLocationRequestStatus = "pending" | "approved" | "rejected";

/** Seller asks admin to move the public shop map pin; coordinates apply only after approval. */
export interface SellerLocationChangeRequest {
    id: string;
    sellerId: string;
    requestedLatitude: number;
    requestedLongitude: number;
    previousLatitude?: number;
    previousLongitude?: number;
    note?: string;
    status: SellerLocationRequestStatus;
    createdAt: string;
    reviewedAt?: string;
    rejectionReason?: string;
}

export interface VerificationSubmission {
    id: string;
    sellerId: string;
    permitFileUrl: string;
    /** Storage object key inside the verification bucket (preferred for admin signed download). */
    permitObjectPath?: string;
    note?: string;
    status: "pending" | "approved" | "rejected";
    rejectionReason?: string;
}

export interface CartItem {
    id: string;
    buyerId?: string;
    guestSessionId?: string;
    productId: string;
    quantity: number;
    /** Chosen customization options (empty if the product has none). */
    selections: CartItemSelection[];
}

/** One row the seller defines before confirming an order. */
export interface OrderQualityChecklistItem {
    id: string;
    label: string;
    checked: boolean;
}

/** Saved when the seller confirms the order; shown to the buyer as a quality attestation. */
export interface OrderQualityChecklist {
    items: OrderQualityChecklistItem[];
}

export interface OrderRecord {
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
    /** Buyer-uploaded payment receipt (online checkout). */
    receiptProofUrl?: string;
    /** Seller-configured method the buyer paid with. */
    sellerPaymentMethodId?: string;
    /** Lower bound of buyer-facing delivery estimate (ISO). */
    estimatedDeliveryStartAt?: string;
    /** Upper bound of buyer-facing delivery estimate (ISO). */
    estimatedDeliveryEndAt?: string;
    /** Preformatted range as shown at checkout (optional; can derive from start/end). */
    estimatedDeliveryRangeDisplay?: string;
    /** Snapshot from checkout — recipient and shipping for this order. */
    shippingRecipientName?: string;
    shippingAddressLine?: string;
    shippingCity?: string;
    shippingPostalCode?: string;
    shippingContactNumber?: string;
    deliveryNotes?: string;
    /** Set when status is cancelled (seller-facing explanation for the buyer). */
    cancellationReason?: string;
    /** Populated when the seller confirms (POST status → confirmed with checklist). */
    qualityChecklist?: OrderQualityChecklist;
}

/** Snapshot of cart rows at checkout; used for eligibility (e.g. product reviews). */
export interface OrderLineItemRecord {
    id: string;
    orderId: string;
    productId: string;
    quantity: number;
    createdAt: string;
    /** Snapshot of cart customization choices at checkout. */
    selections: CartItemSelection[];
}

export interface OrderMessage {
    id: string;
    orderId: string;
    senderId: string;
    body: string;
    createdAt: string;
}

export interface ProductReviewRecord {
    id: string;
    productId: string;
    buyerId: string;
    rating: number;
    body: string;
    createdAt: string;
    updatedAt: string;
}

export interface ConversationRecord {
    id: string;
    buyerId: string;
    sellerId: string;
    updatedAt: string;
}

export interface ConversationMessageRecord {
    id: string;
    conversationId: string;
    senderId: string;
    body: string;
    createdAt: string;
}

export interface CartItemSelection {
    optionId: string;
    value: string;
    /** Option name captured at checkout; kept on order lines if the listing changes later. */
    optionLabel?: string;
}

export interface ProductMedia {
    id: string;
    productId: string;
    url: string;
}

export interface CustomizationOption {
    id: string;
    productId: string;
    name: string;
    values: string[];
}

export interface CustomizationRule {
    id: string;
    productId: string;
    label: string;
    amount: number;
}
