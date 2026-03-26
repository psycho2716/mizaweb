import { apiFetch } from "@/lib/api/client";

interface VerificationStatusResponse {
  status: string;
}

export default async function SellerVerificationPage() {
  let status = "unknown";
  try {
    const response = await apiFetch<VerificationStatusResponse>(
      "/seller/verification/status",
      {
        userId: "u-seller-1",
      },
    );
    status = response.status;
  } catch {
    status = "unavailable";
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-semibold">Seller Verification</h1>
      <p className="mt-3 text-sm">Current status: {status}</p>
    </main>
  );
}
