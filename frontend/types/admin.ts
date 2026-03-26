export interface VerificationSubmission {
  id: string;
  sellerId: string;
  permitFileUrl: string;
  status: "pending" | "approved" | "rejected";
  note?: string;
  rejectionReason?: string;
}
