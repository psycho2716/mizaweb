export interface Product {
  id: string;
  sellerId: string;
  title: string;
  description: string;
  basePrice: number;
  isPublished: boolean;
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
}

export interface SellerPublicProfile {
  id: string;
  email: string;
  sellerId: string;
  businessName: string;
  contactNumber: string;
  address: string;
  verificationStatus: string;
  publishedProducts: number;
  profileImageUrl?: string;
  storeBackgroundUrl?: string;
  paymentQrUrl?: string;
}
