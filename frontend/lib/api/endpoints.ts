import { apiFetch } from "@/lib/api/client";
import type {
  AuthLoginResponse,
  ProductCreateResponse,
  ProductsResponse,
  VerificationQueueResponse,
  VerificationStatusResponse,
  VerificationSubmitResponse,
  VerificationUploadTarget,
} from "@/types";

export function loginWithUserId(userId: string) {
  return apiFetch<AuthLoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ userId }),
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
      ...(note ? { note } : {}),
    }),
  });
}

export function createVerificationUploadUrl(filename: string) {
  return apiFetch<VerificationUploadTarget>("/seller/verification/upload-url", {
    method: "POST",
    body: JSON.stringify({ filename }),
  });
}

export function listPendingVerifications() {
  return apiFetch<VerificationQueueResponse>("/admin/verifications?status=pending");
}

export function approveVerification(verificationId: string) {
  return apiFetch<{ ok: boolean }>(`/admin/verifications/${verificationId}/approve`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function createProduct(
  payload: { title: string; description: string; basePrice: number },
) {
  return apiFetch<ProductCreateResponse>("/products", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function publishProduct(productId: string) {
  return apiFetch<{ ok: boolean }>(`/products/${productId}/publish`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function getPublishedProducts() {
  return apiFetch<ProductsResponse>("/products");
}
