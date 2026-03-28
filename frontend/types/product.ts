export interface Product {
  id: string;
  sellerId: string;
  title: string;
  description: string;
  basePrice: number;
  isPublished: boolean;
  model3dUrl?: string;
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
