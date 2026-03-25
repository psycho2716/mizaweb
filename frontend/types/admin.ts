export type SellerVerificationStatus = "pending" | "approved" | "rejected";

export interface SellerVerification {
  seller_id: string;
  status: SellerVerificationStatus;
}

