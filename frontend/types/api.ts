export interface ApiError {
  error: string;
}

import type { AuthUser } from "./auth";
import type { ConversationThread, DirectMessage } from "./messaging";
import type {
  CartItemSelection,
  Order,
  OrderLineItem,
  OrderMessage,
  OrderQualityChecklist
} from "./order";
import type { Product } from "./product";
import type { ProductReview } from "./review";
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

export interface AuthMeResponse {
  user: AuthUser | undefined;
}

export interface BuyerProfileUpdateResponse {
  ok: boolean;
  data: AuthUser;
}

/** PATCH /buyer/profile — optional fields; empty strings clear stored contact/shipping metadata where supported. */
export interface UpdateBuyerProfilePayload {
  fullName?: string;
  profileImageUrl?: string;
  contactNumber?: string;
  shippingAddressLine?: string;
  shippingCity?: string;
  shippingPostalCode?: string;
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

export interface ProductReviewsResponse {
  data: ProductReview[];
}

export interface PostProductReviewResponse {
  data: ProductReview;
}

export interface ProductReviewEligibility {
  hasCompletedPurchase: boolean;
  eligible: boolean;
  cooldownEndsAt: string | null;
}

export interface ProductReviewEligibilityResponse {
  data: ProductReviewEligibility;
}

export interface ConversationsListResponse {
  data: ConversationThread[];
}

export interface ConversationCreateResponse {
  data: { id: string; buyerId: string; sellerId: string; updatedAt: string };
}

export interface DirectMessagesResponse {
  data: DirectMessage[];
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
  selections?: CartItemSelection[];
}

export interface CartResponse {
  data: CartItemResponse[];
}

export interface CheckoutOrderSummary {
  id: string;
  sellerId: string;
  totalAmount: number;
}

export interface CheckoutResponse {
  orders: CheckoutOrderSummary[];
}

export interface OrderDetailResponse {
  data: {
    order: Order;
    lineItems: OrderLineItem[];
    /** Present when the viewer is the seller or an admin. */
    buyerDisplayName?: string;
  };
}

export interface OrdersResponse {
  data: Order[];
}

export interface OrderMessagesResponse {
  data: OrderMessage[];
}

/** Buyer dashboard: posted reviews and products from delivered orders still unrated. */
export interface BuyerReviewSubmittedItem {
  id: string;
  productId: string;
  rating: number;
  body: string;
  createdAt: string;
  updatedAt: string;
  productTitle: string;
  thumbnailUrl: string | null;
}

export interface BuyerReviewPendingItem {
  productId: string;
  productTitle: string;
  thumbnailUrl: string | null;
  orderReferenceAt: string;
}

export interface BuyerReviewsDashboardData {
  submitted: BuyerReviewSubmittedItem[];
  pending: BuyerReviewPendingItem[];
  stats: {
    submittedCount: number;
    pendingCount: number;
    uniqueProductsRated: number;
  };
}

export interface BuyerReviewsResponse {
  data: BuyerReviewsDashboardData;
}

/** One purchased line on a buyer order (titles + checkout customization snapshot). */
export interface BuyerOrderLineItemSummary {
  id: string;
  productId: string;
  quantity: number;
  productTitle: string;
  thumbnailUrl: string | null;
  selections: CartItemSelection[];
}

/** Buyer order list row with first-line preview for history table. */
export interface BuyerOrderSummaryItem {
  id: string;
  sellerId: string;
  status: Order["status"];
  paymentMethod: Order["paymentMethod"];
  paymentStatus: Order["paymentStatus"];
  totalAmount: number;
  createdAt: string;
  itemCount: number;
  previewProductTitle: string;
  previewThumbnailUrl: string | null;
  lineItems: BuyerOrderLineItemSummary[];
  estimatedDeliveryStartAt?: string;
  estimatedDeliveryEndAt?: string;
  estimatedDeliveryRangeDisplay?: string;
  shippingRecipientName?: string;
  shippingAddressLine?: string;
  shippingCity?: string;
  shippingPostalCode?: string;
  shippingContactNumber?: string;
  deliveryNotes?: string;
  cancellationReason?: string;
  qualityChecklist?: OrderQualityChecklist;
  receiptStatus: Order["receiptStatus"];
  receiptRequestNote?: string;
}

export interface BuyerOrdersSummaryResponse {
  data: BuyerOrderSummaryItem[];
}

export interface SellerOrderSummaryItem {
  id: string;
  buyerId: string;
  buyerDisplayName: string;
  status: Order["status"];
  paymentMethod: Order["paymentMethod"];
  paymentStatus: Order["paymentStatus"];
  totalAmount: number;
  createdAt: string;
  itemCount: number;
  previewProductTitle: string;
  previewThumbnailUrl: string | null;
}

export interface SellerOrdersSummaryResponse {
  data: SellerOrderSummaryItem[];
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
  /** Persist this after a successful PUT when present (public object URL). */
  publicUrl?: string;
  expiresIn: number;
  provider: "supabase" | "mock";
}

/** After PUT to uploadUrl, use readUrl for display and canonicalUrl for PATCH / DB. */
export interface SellerAssetReadUrlResponse {
  readUrl: string;
  canonicalUrl: string;
}
