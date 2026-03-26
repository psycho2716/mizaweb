export interface ApiError {
  error: string;
}

import type { AuthUser } from "./auth";
import type { Order, OrderMessage } from "./order";
import type { Product } from "./product";
import type { VerificationSubmission } from "./admin";
import type { ProductDetail, SellerPublicProfile } from "./product";

export interface AuthLoginResponse {
  token: string;
  user: AuthUser;
}

export interface LandingHighlightsResponse {
  recommendedProducts: Product[];
  topSellers: Array<{
    id: string;
    email: string;
    publishedCount: number;
  }>;
}

export interface ProductDetailResponse {
  data: ProductDetail;
}

export interface SellerProfileResponse {
  data: SellerPublicProfile;
}

export interface CartItemResponse {
  id: string;
  productId: string;
  quantity: number;
  buyerId?: string;
  guestSessionId?: string;
}

export interface CartResponse {
  data: CartItemResponse[];
}

export interface CheckoutResponse {
  id: string;
  status: "created";
  totalAmount: number;
}

export interface OrdersResponse {
  data: Order[];
}

export interface OrderMessagesResponse {
  data: OrderMessage[];
}

export interface ProductsResponse {
  data: Product[];
}

export interface ProductCreateResponse {
  id: string;
}

export interface VerificationStatusResponse {
  status: string;
}

export interface VerificationSubmitResponse {
  id: string;
  status: "pending";
}

export interface VerificationQueueResponse {
  data: VerificationSubmission[];
}

export interface VerificationUploadTarget {
  path: string;
  uploadUrl: string;
  expiresIn: number;
  provider: "supabase" | "mock";
}
