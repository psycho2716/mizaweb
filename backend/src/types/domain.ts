export type UserRole = "buyer" | "seller" | "admin";

export type VerificationStatus = "unsubmitted" | "pending" | "approved" | "rejected";

export interface AuthUser {
    id: string;
    email: string;
    role: UserRole;
    fullName?: string;
}

export interface SellerProfile {
    sellerId: string;
    businessName: string;
    contactNumber: string;
    address: string;
    profileImageUrl?: string;
    storeBackgroundUrl?: string;
    paymentQrUrl?: string;
}

export interface ProductRecord {
    id: string;
    sellerId: string;
    title: string;
    description: string;
    basePrice: number;
    isPublished: boolean;
}

export interface VerificationSubmission {
    id: string;
    sellerId: string;
    permitFileUrl: string;
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
}

export interface OrderRecord {
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

export interface CartItemSelection {
    optionId: string;
    value: string;
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
