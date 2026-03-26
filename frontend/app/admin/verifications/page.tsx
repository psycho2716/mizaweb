import { apiFetch } from "@/lib/api/client";
import type { VerificationSubmission } from "@/types";

interface VerificationResponse {
  data: VerificationSubmission[];
}

export default async function AdminVerificationsPage() {
  let queue: VerificationSubmission[] = [];
  try {
    const response = await apiFetch<VerificationResponse>(
      "/admin/verifications?status=pending",
      {
        userId: "u-admin-1",
      },
    );
    queue = response.data;
  } catch {
    queue = [];
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="text-2xl font-semibold">Admin Verification Queue</h1>
      <div className="mt-4 space-y-3">
        {queue.map((entry) => (
          <div key={entry.id} className="rounded border p-3 text-sm">
            <p>Submission: {entry.id}</p>
            <p>Seller: {entry.sellerId}</p>
            <p>Status: {entry.status}</p>
          </div>
        ))}
        {queue.length === 0 ? (
          <p className="text-sm text-zinc-600">No pending submissions.</p>
        ) : null}
      </div>
    </main>
  );
}
