"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { backendFetchJson } from "@/lib/backend-api";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

interface VerificationRow {
  seller_id: string;
  permit_storage_path: string;
  status: string;
  admin_notes: string | null;
  created_at: string;
}

export function AdminDashboardClient() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [token, setToken] = useState<string | null>(null);
  const [rows, setRows] = useState<VerificationRow[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const t = data.session?.access_token ?? null;
    setToken(t);
    if (!t) return;
    try {
      const res = await backendFetchJson<{ verifications: VerificationRow[] }>("/admin/seller-verifications?status=pending", {
        accessToken: t,
      });
      setRows(res.verifications);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load queue.");
    }
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (sellerId: string, status: "approved" | "rejected") => {
    if (!token) return;
    try {
      await backendFetchJson(`/admin/sellers/${sellerId}/verify`, {
        method: "POST",
        accessToken: token,
        body: JSON.stringify({
          status,
          admin_notes: notes[sellerId] || null,
        }),
      });
      toast.success(`Seller ${status}.`);
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed.");
    }
  };

  if (!token) {
    return <p className="text-red-600">Session required.</p>;
  }

  return (
    <div className="space-y-4">
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-600">No pending verifications.</p>
      ) : (
        <ul className="space-y-4">
          {rows.map((r) => (
            <li key={r.seller_id} className="border border-zinc-200 rounded-lg p-4 bg-white">
              <div className="text-sm font-mono text-zinc-500">Seller {r.seller_id}</div>
              <div className="text-sm mt-1">Permit path: {r.permit_storage_path}</div>
              <textarea
                className="mt-2 w-full border rounded-md px-3 py-2 text-sm"
                placeholder="Admin notes (optional)"
                value={notes[r.seller_id] ?? ""}
                onChange={(e) => setNotes((prev) => ({ ...prev, [r.seller_id]: e.target.value }))}
              />
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  className="rounded-md bg-emerald-700 text-white px-3 py-1.5 text-sm"
                  onClick={() => void decide(r.seller_id, "approved")}
                >
                  Approve
                </button>
                <button
                  type="button"
                  className="rounded-md bg-red-700 text-white px-3 py-1.5 text-sm"
                  onClick={() => void decide(r.seller_id, "rejected")}
                >
                  Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
