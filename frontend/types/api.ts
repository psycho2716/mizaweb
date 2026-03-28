export interface ApiError {
  error: string;
}

import type { AuthUser } from "./auth";
import type { Order, OrderMessage } from "./order";
import type { Product } from "./product";
import type { AdminUserListItem, AdminVerificationItem } from "./admin";
import type { ProductDetail, SellerPublicProfile } from "./product";
import type { SellerPaymentMethod } from "./product";

export interface SellerAnalytics {
  monthlyRevenue: number;
  pendingOrders: number;
  toShipOrders: number;
  deliveredOrders: number;
  unpaidOnlineOrders: number;
  totalProducts: number;
  publishedProducts: number;
}

export interface AuthLoginResponse {
  token: string;
  /** Present when using Supabase Auth sessions (access token in `token`). */
  refreshToken?: string;
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

export interface SellerAnalyticsResponse {
  data: SellerAnalytics;
}

export interface SellerPaymentMethodsResponse {
  data: SellerPaymentMethod[];
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
  /** Present when the seller is rejected; admin message explaining why. */
  rejectionReason?: string;
}

/** UI phases for the seller verification status page (no form; permit is collected at registration). */
export type SellerVerificationUiPhase =
  | "loading"
  | "error"
  | "pending"
  | "approved"
  | "rejected"
  | "unsubmitted";

/** Maps `/seller/verification/status` response to a single UI phase. */
export function toSellerVerificationUiPhase(status: string): SellerVerificationUiPhase {
  if (
    status === "pending" ||
    status === "approved" ||
    status === "rejected" ||
    status === "unsubmitted"
  ) {
    return status;
  }
  return "unsubmitted";
}

export interface VerificationSubmitResponse {
  id: string;
  status: "pending";
}

/** Shared shape for paginated admin list endpoints. */
export interface ListPaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface VerificationQueueResponse {
  data: AdminVerificationItem[];
  pagination: ListPaginationMeta;
}

export interface AdminUsersListResponse {
  data: AdminUserListItem[];
  pagination: ListPaginationMeta;
}

export interface VerificationUploadTarget {
  path: string;
  uploadUrl: string;
  expiresIn: number;
  provider: "supabase" | "mock";
}
