"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { approveVerification, listPendingVerifications, rejectVerification } from "@/lib/api/endpoints";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AdminVerificationItem } from "@/types";

export default function AdminVerificationsPage() {
  const [queue, setQueue] = useState<AdminVerificationItem[]>([]);
  const [message, setMessage] = useState("");
  const [rejectReasonById, setRejectReasonById] = useState<Record<string, string>>({});

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
      if (!window.confirm("Approve this seller verification?")) return;
      await approveVerification(id);
      setMessage(`Approved ${id}`);
      toast.success(`Approved ${id}`);
      await refreshQueue();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Approve failed");
      toast.error(error instanceof Error ? error.message : "Approve failed");
    }
  }

  async function handleReject(id: string) {
    const reason = rejectReasonById[id]?.trim();
    if (!reason) {
      toast.error("Rejection reason is required.");
      return;
    }
    try {
      if (!window.confirm("Reject this verification and request another permit?")) return;
      await rejectVerification(id, reason);
      setMessage(`Rejected ${id}`);
      toast.success(`Rejected ${id}`);
      await refreshQueue();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Reject failed");
      toast.error(error instanceof Error ? error.message : "Reject failed");
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
            <p>Seller ID: {entry.sellerId}</p>
            <p>Seller email: {entry.seller?.email ?? "N/A"}</p>
            <p>Seller name: {entry.seller?.fullName ?? "N/A"}</p>
            <p>Business name: {entry.profile?.businessName ?? "N/A"}</p>
            <p>Contact number: {entry.profile?.contactNumber ?? "N/A"}</p>
            <p>Business address: {entry.profile?.address ?? "N/A"}</p>
            <p>
              Business permit:{" "}
              <a
                href={entry.permitFileUrl}
                target="_blank"
                rel="noreferrer"
                className="underline text-zinc-900"
              >
                View submitted permit
              </a>
            </p>
            {entry.note ? <p>Seller note: {entry.note}</p> : null}
            <div className="mt-2 rounded bg-zinc-50 p-2">
              <p className="font-medium">Seller payment methods</p>
              {entry.paymentMethods.length === 0 ? (
                <p className="text-xs text-zinc-600">No payment methods configured.</p>
              ) : (
                <ul className="list-disc pl-5">
                  {entry.paymentMethods.map((method) => (
                    <li key={method.id}>
                      {method.methodName} - {method.accountName} ({method.accountNumber})
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <p className="flex items-center gap-2">
              Status: <Badge>{entry.status}</Badge>
            </p>
            <div className="mt-2 grid gap-2">
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="mt-2"
                  onClick={() => void handleApprove(entry.id)}
                >
                  Approve
                </Button>
              </div>
              <Label htmlFor={`reject-${entry.id}`}>Reject reason / request new permit</Label>
              <Input
                id={`reject-${entry.id}`}
                value={rejectReasonById[entry.id] ?? ""}
                onChange={(event) =>
                  setRejectReasonById((previous) => ({
                    ...previous,
                    [entry.id]: event.target.value
                  }))
                }
                placeholder="Explain issue and request new business permit"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-fit border-red-300 text-red-700 hover:bg-red-50"
                onClick={() => void handleReject(entry.id)}
              >
                Reject and Request Resubmission
              </Button>
            </div>
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
