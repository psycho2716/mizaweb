import type { ProductReviewSummary } from "./review";

export interface Product {
  id: string;
  sellerId: string;
  title: string;
  description: string;
  basePrice: number;
  isPublished: boolean;
  /** First listing image URL when returned from seller product list API. */
  thumbnailUrl?: string;
  model3dUrl?: string;
  /** Buyer-specific production; when true, `stockQuantity` is not used. */
  madeToOrder?: boolean;
  /** In-stock units when not made-to-order. */
  stockQuantity?: number;
  isFeatured?: boolean;
  /** Single product video (max one per listing). */
  videoUrl?: string;
}

export interface ProductMedia {
  id: string;
  productId: string;
  url: string;
}

export interface ProductOption {
  id: string;
  productId: string;
  name: string;
  values: string[];
}

export interface ProductRule {
  id: string;
  productId: string;
  label: string;
  amount: number;
}

export interface ProductDetail extends Product {
  media: ProductMedia[];
  options: ProductOption[];
  rules: ProductRule[];
  reviewSummary: ProductReviewSummary;
}

/** Payload for POST `/products` (seller create listing). */
export interface SellerProductCreateInput {
  title: string;
  description: string;
  basePrice: number;
  madeToOrder?: boolean;
  stockQuantity?: number;
  isFeatured?: boolean;
  dimensionChoices?: string[];
  colorChoices?: string[];
  imageUrls?: string[];
  videoUrl?: string;
  model3dUrl?: string;
}

/** Payload for PATCH `/products/:id`. */
export type SellerProductPatchInput = Partial<SellerProductCreateInput>;

export type SellerLocationRequestStatus = "pending" | "approved" | "rejected";

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

export interface SellerPublicProfile {
  id: string;
  email: string;
  fullName?: string;
  sellerId: string;
  businessName: string;
  contactNumber: string;
  address: string;
  /** WGS84 coordinates when the seller pinned their shop (e.g. at registration). */
  shopLatitude?: number;
  shopLongitude?: number;
  verificationStatus: string;
  publishedProducts: number;
  /** Average star rating across all published products (null when no reviews). */
  averageRating?: number | null;
  reviewCount?: number;
  profileImageUrl?: string;
  storeBackgroundUrl?: string;
  paymentMethods: SellerPaymentMethod[];
  /** Set when the seller is waiting for admin to approve a new map pin. */
  pendingLocationRequest?: SellerLocationChangeRequest | null;
}

export interface SellerPaymentMethod {
  id: string;
  sellerId: string;
  methodName: string;
  accountName: string;
  accountNumber: string;
  qrImageUrl?: string;
}
