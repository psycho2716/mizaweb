export interface VerificationSubmission {
  id: string;
  sellerId: string;
  permitFileUrl: string;
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
