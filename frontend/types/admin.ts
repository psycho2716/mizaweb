import type { AuthUser } from "./auth";
import type { SellerPaymentMethod } from "./product";

export type SellerVerificationState = "unsubmitted" | "pending" | "approved" | "rejected";

export interface AdminOverviewData {
  pendingVerifications: number;
  verifiedSellers: number;
  unverifiedSellers: number;
  totalSellers: number;
}

export interface AdminUserListItem {
  id: string;
  email: string;
  role: AuthUser["role"];
  fullName?: string;
  suspended: boolean;
  verificationStatus?: SellerVerificationState;
}

export interface AdminUserDetailData {
  user: AuthUser;
  profile: {
    sellerId: string;
    businessName: string;
    contactNumber: string;
    address: string;
    shopLatitude?: number;
    shopLongitude?: number;
    profileImageUrl?: string;
    storeBackgroundUrl?: string;
  } | null;
  paymentMethods: SellerPaymentMethod[];
  verificationStatus?: SellerVerificationState;
  verifications: VerificationSubmission[];
}

export interface VerificationSubmission {
  id: string;
  sellerId: string;
  permitFileUrl: string;
  /** Storage key in verification bucket when provided at submit (reliable for admin view). */
  permitObjectPath?: string;
  status: "pending" | "approved" | "rejected";
  note?: string;
  rejectionReason?: string;
}

export interface AdminVerificationItem extends VerificationSubmission {
  seller: {
    id: string;
    email: string;
    fullName?: string;
  } | null;
  profile: {
    sellerId: string;
    businessName: string;
    contactNumber: string;
    address: string;
    shopLatitude?: number;
    shopLongitude?: number;
    profileImageUrl?: string;
    storeBackgroundUrl?: string;
  } | null;
  paymentMethods: Array<{
    id: string;
    sellerId: string;
    methodName: string;
    accountName: string;
    accountNumber: string;
    qrImageUrl?: string;
  }>;
}

export interface AdminVerificationExpandedPanelProps {
  entry: AdminVerificationItem;
  rejectReasonById: Record<string, string>;
  onRejectReasonChange: (verificationId: string, value: string) => void;
  onReject: (verificationId: string) => void;
}
