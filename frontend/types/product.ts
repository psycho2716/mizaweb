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

/** Result of mapping a listing color/finish label to a 3D albedo tint. */
export interface ResolvedMaterialTint {
  hex: string;
  /** Lerp factor toward `hex` in the viewer (0–1). */
  blend: number;
}

/**
 * Buyer 3D preview: derived from listing options (color, dimensions, finish).
 * Applied in real time on the product detail GLB viewer.
 */
export interface ProductModelViewerCustomization {
  /** Blend mesh color toward this hex when a color-like option is selected. */
  materialTintHex?: string;
  /** How strongly to lerp albedo toward `materialTintHex` (0–1). Stronger = swatch-accurate preview. */
  materialTintBlend?: number;
  /** Uniform scale vs baseline dimension preset (1 = default). */
  scaleUniform: number;
  /** Multiplier for PBR roughness from finish option (1 = model default after load). */
  finishRoughnessMultiplier?: number;
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
  /** Published listings for public storefront grid (from GET /sellers/:id/profile). */
  storefrontProducts?: Product[];
}

export interface SellerPaymentMethod {
  id: string;
  sellerId: string;
  methodName: string;
  accountName: string;
  accountNumber: string;
  qrImageUrl?: string;
}
