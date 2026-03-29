import { apiFetch } from "@/lib/api/client";
import type {
    AdminLocationRequestItem,
    AdminOverviewData,
    AdminUserDetailData,
    AuthLoginResponse,
    AuthMeResponse,
    BuyerProfileUpdateResponse,
    CartResponse,
    CheckoutResponse,
    ConversationCreateResponse,
    ConversationsListResponse,
    DirectMessage,
    DirectMessagesResponse,
    LandingHighlightsResponse,
    OrdersResponse,
    OrderMessagesResponse,
    PostProductReviewResponse,
    ProductDetailResponse,
    ProductCreateResponse,
    ProductReviewsResponse,
    ProductsResponse,
    SellerAnalyticsResponse,
    SellerPaymentMethodsResponse,
    ListPaginationMeta,
    SellerLocationChangeRequest,
    SellerPublicProfile,
    SellerProfileResponse,
    SellerProductCreateInput,
    SellerProductPatchInput,
    AdminUsersListResponse,
    VerificationQueueResponse,
    VerificationStatusResponse,
    VerificationSubmitResponse,
    SellerAssetReadUrlResponse,
    VerificationUploadTarget
} from "@/types";

export function loginWithEmailPassword(email: string, password: string) {
    return apiFetch<AuthLoginResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
    });
}

export function getAuthMe() {
    return apiFetch<AuthMeResponse>("/auth/me");
}

export function registerAccount(
    email: string,
    password: string,
    role: "buyer" | "seller",
    details?: {
        fullName?: string;
        businessName?: string;
        contactNumber?: string;
        address?: string;
        shopLatitude?: number;
        shopLongitude?: number;
    }
) {
    return apiFetch<AuthLoginResponse>("/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password, role, ...(details ?? {}) })
    });
}

export function getSellerVerificationStatus() {
    return apiFetch<VerificationStatusResponse>("/seller/verification/status");
}

export function submitSellerVerification(
    permitFileUrl: string,
    note?: string,
    permitObjectPath?: string
) {
    return apiFetch<VerificationSubmitResponse>("/seller/verification/submit", {
        method: "POST",
        body: JSON.stringify({
            permitFileUrl,
            ...(note ? { note } : {}),
            ...(permitObjectPath ? { permitObjectPath } : {})
        })
    });
}

export function resubmitSellerVerification(
    permitFileUrl: string,
    note?: string,
    permitObjectPath?: string
) {
    return apiFetch<VerificationSubmitResponse>("/seller/verification/resubmit", {
        method: "POST",
        body: JSON.stringify({
            permitFileUrl,
            ...(note ? { note } : {}),
            ...(permitObjectPath ? { permitObjectPath } : {})
        })
    });
}

export function createVerificationUploadUrl(filename: string) {
    return apiFetch<VerificationUploadTarget>("/seller/verification/upload-url", {
        method: "POST",
        body: JSON.stringify({ filename })
    });
}

export function createSellerAssetUploadUrl(
    filename: string,
    kind: "profile" | "background" | "payment-qr"
) {
    return apiFetch<VerificationUploadTarget>("/seller/assets/upload-url", {
        method: "POST",
        body: JSON.stringify({ filename, kind })
    });
}

export function signSellerAssetReadUrl(path: string) {
    return apiFetch<SellerAssetReadUrlResponse>("/seller/assets/read-url", {
        method: "POST",
        body: JSON.stringify({ path })
    });
}

export function getAdminOverview() {
    return apiFetch<{ data: AdminOverviewData }>("/admin/overview");
}

export function listAdminUsers(params?: { page?: number; limit?: number }) {
    const search = new URLSearchParams();
    if (params?.page !== undefined) search.set("page", String(params.page));
    if (params?.limit !== undefined) search.set("limit", String(params.limit));
    const qs = search.toString();
    return apiFetch<AdminUsersListResponse>(`/admin/users${qs ? `?${qs}` : ""}`);
}

export function getAdminUserDetail(userId: string) {
    return apiFetch<{ data: AdminUserDetailData }>(`/admin/users/${userId}`);
}

export function suspendAdminUser(userId: string) {
    return apiFetch<{ ok: boolean }>(`/admin/users/${userId}/suspend`, {
        method: "POST",
        body: JSON.stringify({})
    });
}

export function unsuspendAdminUser(userId: string) {
    return apiFetch<{ ok: boolean }>(`/admin/users/${userId}/unsuspend`, {
        method: "POST",
        body: JSON.stringify({})
    });
}

export function deleteAdminUser(userId: string) {
    return apiFetch<{ ok: boolean }>(`/admin/users/${userId}`, {
        method: "DELETE",
        body: JSON.stringify({})
    });
}

export function listPendingVerifications(params?: { page?: number; limit?: number }) {
    const search = new URLSearchParams();
    search.set("status", "pending");
    if (params?.page !== undefined) search.set("page", String(params.page));
    if (params?.limit !== undefined) search.set("limit", String(params.limit));
    return apiFetch<VerificationQueueResponse>(`/admin/verifications?${search.toString()}`);
}

export function getAdminVerificationPermitUrl(verificationId: string) {
    return apiFetch<{ url: string }>(`/admin/verifications/${verificationId}/permit-url`);
}

export function approveVerification(verificationId: string) {
    return apiFetch<{ ok: boolean }>(`/admin/verifications/${verificationId}/approve`, {
        method: "POST",
        body: JSON.stringify({})
    });
}

export function rejectVerification(verificationId: string, reason: string) {
    return apiFetch<{ ok: boolean }>(`/admin/verifications/${verificationId}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason })
    });
}

export function createProduct(payload: SellerProductCreateInput) {
    return apiFetch<ProductCreateResponse>("/products", {
        method: "POST",
        body: JSON.stringify(payload)
    });
}

export function publishProduct(productId: string) {
    return apiFetch<{ ok: boolean }>(`/products/${productId}/publish`, {
        method: "POST",
        body: JSON.stringify({})
    });
}

export function unpublishProduct(productId: string) {
    return apiFetch<{ ok: boolean }>(`/products/${productId}/unpublish`, {
        method: "POST",
        body: JSON.stringify({})
    });
}

export function getPublishedProducts() {
    return apiFetch<ProductsResponse>("/products");
}

export function getLandingHighlights() {
    return apiFetch<LandingHighlightsResponse>("/public/highlights");
}

export function getProductDetail(productId: string) {
    return apiFetch<ProductDetailResponse>(`/products/${productId}`);
}

export function getProductReviews(productId: string) {
    return apiFetch<ProductReviewsResponse>(`/products/${productId}/reviews`);
}

export function postProductReview(productId: string, rating: number, body: string) {
    return apiFetch<PostProductReviewResponse>(`/products/${productId}/reviews`, {
        method: "POST",
        body: JSON.stringify({ rating, body })
    });
}

export function listConversations() {
    return apiFetch<ConversationsListResponse>("/conversations");
}

export function createConversation(payload: { sellerId?: string; buyerId?: string }) {
    return apiFetch<ConversationCreateResponse>("/conversations", {
        method: "POST",
        body: JSON.stringify(payload)
    });
}

export function getDirectMessages(conversationId: string) {
    return apiFetch<DirectMessagesResponse>(`/conversations/${conversationId}/messages`);
}

export function sendDirectMessage(conversationId: string, body: string) {
    return apiFetch<{ data: DirectMessage }>(`/conversations/${conversationId}/messages`, {
        method: "POST",
        body: JSON.stringify({ body })
    });
}

export function getSellerPublicProfile(sellerId: string) {
    return apiFetch<SellerProfileResponse>(`/sellers/${sellerId}/profile`);
}

export function getSellerAnalytics() {
    return apiFetch<SellerAnalyticsResponse>("/seller/analytics");
}

export function getSellerProducts() {
    return apiFetch<ProductsResponse>("/seller/products");
}

export function getSellerProductDetail(productId: string) {
    return apiFetch<ProductDetailResponse>(`/seller/products/${productId}`);
}

export function updateProduct(productId: string, payload: SellerProductPatchInput) {
    return apiFetch<{ ok: boolean }>(`/products/${productId}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
    });
}

export interface FalImageTo3dResponse {
    falGlbUrl: string;
}

/** Generate a GLB via Fal Trellis 2 from a public image URL (returns temporary Fal CDN URL). */
export function imageUrlTo3dModel(imageUrl: string) {
    return apiFetch<FalImageTo3dResponse>("/seller/ai/image-to-3d", {
        method: "POST",
        body: JSON.stringify({ imageUrl })
    });
}

/** Generate a GLB from an uploaded 2D image (base64 + mime). */
export function imageFileTo3dModel(imageBase64: string, mimeType: string) {
    return apiFetch<FalImageTo3dResponse>("/seller/ai/image-to-3d", {
        method: "POST",
        body: JSON.stringify({ imageBase64, mimeType })
    });
}

export function createProductModel3dUploadUrl(productId: string, filename = "model.glb") {
    return apiFetch<VerificationUploadTarget>(`/products/${productId}/model-3d/upload-url`, {
        method: "POST",
        body: JSON.stringify({ filename })
    });
}

export function createProductMediaUploadUrl(
    productId: string,
    filename: string,
    assetKind: "image" | "video"
) {
    return apiFetch<VerificationUploadTarget>(`/products/${productId}/media/upload-url`, {
        method: "POST",
        body: JSON.stringify({ filename, assetKind })
    });
}

export function addProductMedia(productId: string, url: string) {
    return apiFetch<{ id: string }>(`/products/${productId}/media`, {
        method: "POST",
        body: JSON.stringify({ url })
    });
}

export function deleteProductMedia(productId: string, mediaId: string) {
    return apiFetch<{ ok: boolean }>(`/products/${productId}/media/${mediaId}`, {
        method: "DELETE"
    });
}

export function deleteProductById(productId: string) {
    return apiFetch<{ ok: boolean }>(`/products/${productId}`, {
        method: "DELETE"
    });
}

function ensureGuestSessionId(): string {
    if (typeof window === "undefined") {
        return "server";
    }
    const existing = window.localStorage.getItem("miza_guest_session_id");
    if (existing) {
        return existing;
    }
    const created = `guest-${crypto.randomUUID()}`;
    window.localStorage.setItem("miza_guest_session_id", created);
    return created;
}

export function getCart() {
    ensureGuestSessionId();
    return apiFetch<CartResponse>("/cart", { includeGuestSession: true });
}

export function addCartItem(productId: string, quantity: number) {
    ensureGuestSessionId();
    return apiFetch<{ id: string }>("/cart/items", {
        method: "POST",
        includeGuestSession: true,
        body: JSON.stringify({ productId, quantity })
    });
}

export function checkoutCart(payload: {
    paymentMethod: "cash" | "online";
    paymentReference?: string;
}) {
    ensureGuestSessionId();
    return apiFetch<CheckoutResponse>("/checkout", {
        method: "POST",
        includeGuestSession: true,
        body: JSON.stringify(payload)
    });
}

export function getOrders() {
    return apiFetch<OrdersResponse>("/orders");
}

export function getOrderMessages(orderId: string) {
    return apiFetch<OrderMessagesResponse>(`/orders/${orderId}/messages`);
}

export function sendOrderMessage(orderId: string, body: string) {
    return apiFetch<{
        data: { id: string; orderId: string; senderId: string; body: string; createdAt: string };
    }>(`/orders/${orderId}/messages`, {
        method: "POST",
        body: JSON.stringify({ body })
    });
}

export function updateOrderStatus(
    orderId: string,
    status: "confirmed" | "processing" | "shipped" | "delivered"
) {
    return apiFetch<{ ok: boolean; status: string }>(`/orders/${orderId}/status`, {
        method: "POST",
        body: JSON.stringify({ status })
    });
}

export function updateOrderPaymentStatus(orderId: string, paymentStatus: "pending" | "paid") {
    return apiFetch<{ ok: boolean; paymentStatus: string }>(`/orders/${orderId}/payment-status`, {
        method: "POST",
        body: JSON.stringify({ paymentStatus })
    });
}

export function requestReceiptResubmission(orderId: string, note: string) {
    return apiFetch<{ ok: boolean; receiptStatus: string }>(`/orders/${orderId}/request-receipt`, {
        method: "POST",
        body: JSON.stringify({ note })
    });
}

export function getSellerProfile() {
    return apiFetch<SellerProfileResponse>("/seller/profile");
}

export function updateSellerProfile(payload: {
    fullName?: string;
    businessName?: string;
    contactNumber?: string;
    address?: string;
    profileImageUrl?: string;
    storeBackgroundUrl?: string;
}) {
    return apiFetch<{ ok: boolean; data: SellerPublicProfile }>("/seller/profile", {
        method: "PATCH",
        body: JSON.stringify(payload)
    });
}

export function submitSellerLocationRequest(payload: {
    shopLatitude: number;
    shopLongitude: number;
    note?: string;
}) {
    return apiFetch<{ data: SellerLocationChangeRequest }>("/seller/location-request", {
        method: "POST",
        body: JSON.stringify(payload)
    });
}

export function listAdminLocationRequests(params?: {
    page?: number;
    limit?: number;
    status?: string;
}) {
    const search = new URLSearchParams();
    if (params?.page !== undefined) search.set("page", String(params.page));
    if (params?.limit !== undefined) search.set("limit", String(params.limit));
    if (params?.status) search.set("status", params.status);
    const qs = search.toString();
    return apiFetch<{ data: AdminLocationRequestItem[]; pagination: ListPaginationMeta }>(
        `/admin/location-requests${qs ? `?${qs}` : ""}`
    );
}

export function approveAdminLocationRequest(id: string) {
    return apiFetch<{ ok: boolean; data: unknown }>(`/admin/location-requests/${id}/approve`, {
        method: "POST",
        body: JSON.stringify({})
    });
}

export function rejectAdminLocationRequest(id: string, reason?: string) {
    return apiFetch<{ ok: boolean; data: unknown }>(`/admin/location-requests/${id}/reject`, {
        method: "POST",
        body: JSON.stringify({ ...(reason?.trim() ? { reason: reason.trim() } : {}) })
    });
}

export function getSellerPaymentMethods() {
    return apiFetch<SellerPaymentMethodsResponse>("/seller/payment-methods");
}

export function createSellerPaymentMethod(payload: {
    methodName: string;
    accountName: string;
    accountNumber: string;
    qrImageUrl?: string;
}) {
    return apiFetch<{ data: { id: string } }>("/seller/payment-methods", {
        method: "POST",
        body: JSON.stringify(payload)
    });
}

export function updateSellerPaymentMethod(
    id: string,
    payload: Partial<{
        methodName: string;
        accountName: string;
        accountNumber: string;
        qrImageUrl: string;
    }>
) {
    return apiFetch<{ data: { id: string } }>(
        `/seller/payment-methods/${encodeURIComponent(id)}`,
        {
            method: "PATCH",
            body: JSON.stringify(payload)
        }
    );
}

export function deleteSellerPaymentMethod(id: string) {
    return apiFetch<{ ok: boolean }>(
        `/seller/payment-methods/${encodeURIComponent(id)}`,
        {
            method: "DELETE"
        }
    );
}

export function updateSellerPassword(currentPassword: string, newPassword: string) {
    return apiFetch<{ ok: boolean }>("/seller/account/password", {
        method: "PATCH",
        body: JSON.stringify({ currentPassword, newPassword })
    });
}

export function deleteSellerAccount(password: string) {
    return apiFetch<{ ok: boolean }>("/seller/account", {
        method: "DELETE",
        body: JSON.stringify({ password })
    });
}

export function updateBuyerPassword(currentPassword: string, newPassword: string) {
    return apiFetch<{ ok: boolean }>("/buyer/account/password", {
        method: "PATCH",
        body: JSON.stringify({ currentPassword, newPassword })
    });
}

export function deleteBuyerAccount(password: string) {
    return apiFetch<{ ok: boolean }>("/buyer/account", {
        method: "DELETE",
        body: JSON.stringify({ password })
    });
}

export function updateBuyerProfile(payload: { fullName?: string; profileImageUrl?: string }) {
    return apiFetch<BuyerProfileUpdateResponse>("/buyer/profile", {
        method: "PATCH",
        body: JSON.stringify(payload)
    });
}

export function createBuyerAssetUploadUrl(filename: string) {
    return apiFetch<VerificationUploadTarget>("/buyer/assets/upload-url", {
        method: "POST",
        body: JSON.stringify({ filename })
    });
}
