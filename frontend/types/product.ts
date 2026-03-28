export interface Product {
  id: string;
  sellerId: string;
  title: string;
  description: string;
  basePrice: number;
  isPublished: boolean;
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
  profileImageUrl?: string;
  storeBackgroundUrl?: string;
  paymentMethods: SellerPaymentMethod[];
}

export interface SellerPaymentMethod {
  id: string;
  sellerId: string;
  methodName: string;
  accountName: string;
  accountNumber: string;
  qrImageUrl?: string;
}
