"use client";

import { useEffect, useState } from "react";
import { approveVerification, listPendingVerifications } from "@/lib/api/endpoints";
import type { VerificationSubmission } from "@/types";

export default function AdminVerificationsPage() {
  const [queue, setQueue] = useState<VerificationSubmission[]>([]);
  const [message, setMessage] = useState("");

  async function refreshQueue() {
    try {
      const response = await listPendingVerifications();
      setQueue(response.data);
    } catch {
      setQueue([]);
    }
  }

  useEffect(() => {
    let isCancelled = false;
    listPendingVerifications()
      .then((response) => {
        if (!isCancelled) {
          setQueue(response.data);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setQueue([]);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, []);

  async function handleApprove(id: string) {
    try {
      await approveVerification(id);
      setMessage(`Approved ${id}`);
      await refreshQueue();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Approve failed");
    }
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="text-2xl font-semibold">Admin Verification Queue</h1>
      <p className="mt-2 text-sm text-zinc-700">{message}</p>
      <div className="mt-4 space-y-3">
        {queue.map((entry) => (
          <div key={entry.id} className="rounded border p-3 text-sm">
            <p>Submission: {entry.id}</p>
            <p>Seller: {entry.sellerId}</p>
            <p>Status: {entry.status}</p>
            <button
              type="button"
              className="mt-2 rounded bg-zinc-900 px-3 py-1 text-xs text-white"
              onClick={() => void handleApprove(entry.id)}
            >
              Approve
            </button>
          </div>
        ))}
        {queue.length === 0 ? (
          <p className="text-sm text-zinc-600">No pending submissions.</p>
        ) : null}
      </div>
    </main>
  );
}
