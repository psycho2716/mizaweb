"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { backendFetchJson } from "@/lib/backend-api";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

interface CheckoutFormProps {
  customizationId: string;
}

export function CheckoutForm({ customizationId }: CheckoutFormProps) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deliveryMethod, setDeliveryMethod] = useState<"delivery" | "pickup">("pickup");
  const [addressLine1, setAddressLine1] = useState("");
  const [city, setCity] = useState("");
  const [notes, setNotes] = useState("");
  const [totalAmount, setTotalAmount] = useState("0");

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    setToken(data.session?.access_token ?? null);
  }, [supabase]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        await backendFetchJson<{ customization: { id: string } }>(`/customizations/${customizationId}`, {
          accessToken: token,
        });
      } catch {
        if (!cancelled) toast.error("Could not load customization.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [customizationId, token]);

  const submit = async () => {
    if (!token) {
      toast.error("Please sign in again.");
      return;
    }
    const amount = Number(totalAmount);
    if (Number.isNaN(amount) || amount < 0) {
      toast.error("Enter a valid total amount.");
      return;
    }
    try {
      await backendFetchJson<{ order: { id: string } }>("/orders", {
        method: "POST",
        accessToken: token,
        body: JSON.stringify({
          customization_id: customizationId,
          delivery_method: deliveryMethod,
          total_amount: amount,
          delivery_address_line1: deliveryMethod === "delivery" ? addressLine1 : null,
          delivery_city: deliveryMethod === "delivery" ? city : null,
          delivery_notes: notes || null,
        }),
      });
      toast.success("Order placed.");
      router.push("/customer/dashboard");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Order failed.");
    }
  };

  if (loading) {
    return <p className="text-zinc-600">Loading…</p>;
  }
  if (!token) {
    return <p className="text-red-600">You need to be signed in as a customer.</p>;
  }

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <label className="block text-sm font-medium text-zinc-700">Delivery method</label>
        <select
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2"
          value={deliveryMethod}
          onChange={(e) => setDeliveryMethod(e.target.value as "delivery" | "pickup")}
        >
          <option value="pickup">Pickup</option>
          <option value="delivery">Delivery</option>
        </select>
      </div>

      {deliveryMethod === "delivery" ? (
        <>
          <div>
            <label className="block text-sm font-medium text-zinc-700">Address line</label>
            <input
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2"
              value={addressLine1}
              onChange={(e) => setAddressLine1(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700">City</label>
            <input
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
          </div>
        </>
      ) : null}

      <div>
        <label className="block text-sm font-medium text-zinc-700">Notes (optional)</label>
        <textarea
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-700">Total amount (MVP stub)</label>
        <input
          type="number"
          min={0}
          step="0.01"
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2"
          value={totalAmount}
          onChange={(e) => setTotalAmount(e.target.value)}
        />
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          className="rounded-md bg-zinc-900 text-white px-4 py-2 text-sm"
          onClick={() => void submit()}
        >
          Place order
        </button>
        <Link href="/customer/dashboard" className="rounded-md border border-zinc-300 px-4 py-2 text-sm">
          Cancel
        </Link>
      </div>
    </div>
  );
}
