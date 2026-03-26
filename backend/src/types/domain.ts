export type UserRole = "buyer" | "seller" | "admin";

export type VerificationStatus =
  | "unsubmitted"
  | "pending"
  | "approved"
  | "rejected";

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
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
  buyerId: string;
  productId: string;
  quantity: number;
}

export interface OrderRecord {
  id: string;
  buyerId: string;
  status: "created" | "confirmed" | "processing" | "shipped" | "delivered";
  createdAt: string;
}
