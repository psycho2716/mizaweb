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

export function createVerificationUploadUrl(filename: string) {
    return apiFetch<VerificationUploadTarget>("/seller/verification/upload-url", {
        method: "POST",
        body: JSON.stringify({ filename })
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
