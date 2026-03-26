"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
      toast.success(`Approved ${id}`);
      await refreshQueue();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Approve failed");
      toast.error(error instanceof Error ? error.message : "Approve failed");
    }
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      <Card>
        <CardHeader>
          <CardTitle>Admin Verification Queue</CardTitle>
          <CardDescription>{message || "Review pending submissions."}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
        {queue.map((entry) => (
          <div key={entry.id} className="rounded border border-zinc-200 p-3 text-sm">
            <p>Submission: {entry.id}</p>
            <p>Seller: {entry.sellerId}</p>
            <p className="flex items-center gap-2">
              Status: <Badge>{entry.status}</Badge>
            </p>
            <Button
              type="button"
              size="sm"
              className="mt-2"
              onClick={() => void handleApprove(entry.id)}
            >
              Approve
            </Button>
          </div>
        ))}
        {queue.length === 0 ? (
          <p className="text-sm text-zinc-600">No pending submissions.</p>
        ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
