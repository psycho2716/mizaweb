import { apiFetch } from "@/lib/api/client";
import type {
    AuthLoginResponse,
    CartResponse,
    CheckoutResponse,
    LandingHighlightsResponse,
    OrdersResponse,
    OrderMessagesResponse,
    ProductDetailResponse,
    ProductCreateResponse,
    ProductsResponse,
    SellerAnalyticsResponse,
    SellerPaymentMethodsResponse,
    SellerPublicProfile,
    SellerProfileResponse,
    VerificationQueueResponse,
    VerificationStatusResponse,
    VerificationSubmitResponse,
    VerificationUploadTarget
} from "@/types";

export function loginWithEmailPassword(email: string, password: string) {
    return apiFetch<AuthLoginResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
    });
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

export function submitSellerVerification(permitFileUrl: string, note?: string) {
    return apiFetch<VerificationSubmitResponse>("/seller/verification/submit", {
        method: "POST",
        body: JSON.stringify({
            permitFileUrl,
            ...(note ? { note } : {})
        })
    });
}

export function resubmitSellerVerification(permitFileUrl: string, note?: string) {
    return apiFetch<VerificationSubmitResponse>("/seller/verification/resubmit", {
        method: "POST",
        body: JSON.stringify({
            permitFileUrl,
            ...(note ? { note } : {})
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

export function listPendingVerifications() {
    return apiFetch<VerificationQueueResponse>("/admin/verifications?status=pending");
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

export function createProduct(payload: { title: string; description: string; basePrice: number }) {
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

export function getPublishedProducts() {
    return apiFetch<ProductsResponse>("/products");
}

export function getLandingHighlights() {
    return apiFetch<LandingHighlightsResponse>("/public/highlights");
}

export function getProductDetail(productId: string) {
    return apiFetch<ProductDetailResponse>(`/products/${productId}`);
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

export function updateProduct(
    productId: string,
    payload: Partial<{
        title: string;
        description: string;
        basePrice: number;
        model3dUrl: string;
    }>
) {
    return apiFetch<{ ok: boolean }>(`/products/${productId}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
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
    return apiFetch<{ data: { id: string } }>(`/seller/payment-methods/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
    });
}

export function deleteSellerPaymentMethod(id: string) {
    return apiFetch<{ ok: boolean }>(`/seller/payment-methods/${id}`, {
        method: "DELETE"
    });
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
