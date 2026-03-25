"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { backendFetchJson, backendUrl } from "@/lib/backend-api";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { ProductSummary } from "@/types";

interface SellerMeResponse {
  profile: { id: string; role: string; display_name: string | null };
  verification: { status: string; permit_storage_path: string; admin_notes: string | null } | null;
  location: { shop_lat: number; shop_lng: number; shop_label: string | null } | null;
}

export function SellerDashboardClient() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<SellerMeResponse | null>(null);
  const [products, setProducts] = useState<ProductSummary[]>([]);

  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [label, setLabel] = useState("");

  const [pName, setPName] = useState("");
  const [pCategory, setPCategory] = useState<"marble" | "limestone" | "pebbles">("marble");
  const [pDesc, setPDesc] = useState("");
  const [pStatus, setPStatus] = useState<"draft" | "published">("draft");
  const [pTemplate, setPTemplate] = useState(
    JSON.stringify(
      {
        version: 1,
        fields: [
          { key: "length", type: "number", unit: "mm", min: 100, max: 3000, required: true },
          { key: "width", type: "number", unit: "mm", min: 100, max: 3000, required: true },
          { key: "thickness", type: "number", unit: "mm", min: 10, max: 200, required: false },
        ],
      },
      null,
      2
    )
  );
  const [pFile, setPFile] = useState<File | null>(null);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const t = data.session?.access_token ?? null;
    setToken(t);
    if (!t) return;
    try {
      const m = await backendFetchJson<SellerMeResponse>("/seller/me", { accessToken: t });
      setMe(m);
      if (m.location) {
        setLat(String(m.location.shop_lat));
        setLng(String(m.location.shop_lng));
        setLabel(m.location.shop_label ?? "");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load seller profile.");
    }

    const { data: rows } = await supabase
      .from("products")
      .select("id,seller_id,name,category,description,primary_image_storage_path,status")
      .order("created_at", { ascending: false });
    setProducts((rows as ProductSummary[] | null) ?? []);
  }, [supabase]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const uploadPermit = async (file: File | null) => {
    if (!file || !token) {
      toast.error("Choose a permit file.");
      return;
    }
    const fd = new FormData();
    fd.append("permit", file);
    const res = await fetch(backendUrl("/seller/permit"), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    const text = await res.text();
    if (!res.ok) {
      const j = text ? (JSON.parse(text) as { error?: string }) : {};
      toast.error(j.error ?? "Upload failed.");
      return;
    }
    toast.success("Permit submitted for review.");
    void refresh();
  };

  const saveLocation = async () => {
    if (!token) return;
    try {
      await backendFetchJson("/seller/location", {
        method: "POST",
        accessToken: token,
        body: JSON.stringify({
          shop_lat: Number(lat),
          shop_lng: Number(lng),
          shop_label: label || null,
        }),
      });
      toast.success("Shop location saved.");
      void refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed.");
    }
  };

  const createProduct = async () => {
    if (!token || !pFile) {
      toast.error("Primary image is required.");
      return;
    }
    const fd = new FormData();
    fd.append("primary_image", pFile);
    fd.append("name", pName);
    fd.append("category", pCategory);
    fd.append("description", pDesc);
    fd.append("status", pStatus);
    fd.append("template_schema", pTemplate);
    const res = await fetch(backendUrl("/seller/products"), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    const text = await res.text();
    const j = text ? (JSON.parse(text) as { error?: string; product?: { id: string } }) : {};
    if (!res.ok) {
      toast.error(j.error ?? "Create failed.");
      return;
    }
    toast.success("Product created.");
    setPName("");
    setPDesc("");
    setPFile(null);
    void refresh();
  };

  return (
    <div className="space-y-10 max-w-3xl">
      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-medium">Verification</h2>
        {me?.verification ? (
          <p className="text-sm text-zinc-600 mt-2">
            Status: <span className="font-medium">{me.verification.status}</span>
            {me.verification.admin_notes ? ` — ${me.verification.admin_notes}` : ""}
          </p>
        ) : (
          <p className="text-sm text-zinc-600 mt-2">No permit on file yet.</p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="file"
            accept="image/*,.pdf"
            onChange={(e) => void uploadPermit(e.target.files?.[0] ?? null)}
          />
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 space-y-3">
        <h2 className="text-lg font-medium">Shop map pin</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-sm block">
            Latitude
            <input className="mt-1 w-full border rounded-md px-3 py-2" value={lat} onChange={(e) => setLat(e.target.value)} />
          </label>
          <label className="text-sm block">
            Longitude
            <input className="mt-1 w-full border rounded-md px-3 py-2" value={lng} onChange={(e) => setLng(e.target.value)} />
          </label>
        </div>
        <label className="text-sm block">
          Label (optional)
          <input className="mt-1 w-full border rounded-md px-3 py-2" value={label} onChange={(e) => setLabel(e.target.value)} />
        </label>
        <button type="button" className="rounded-md bg-zinc-900 text-white px-4 py-2 text-sm" onClick={() => void saveLocation()}>
          Save location
        </button>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 space-y-3">
        <h2 className="text-lg font-medium">New product</h2>
        <input
          className="w-full border rounded-md px-3 py-2"
          placeholder="Name"
          value={pName}
          onChange={(e) => setPName(e.target.value)}
        />
        <select
          className="w-full border rounded-md px-3 py-2"
          value={pCategory}
          onChange={(e) => setPCategory(e.target.value as typeof pCategory)}
        >
          <option value="marble">marble</option>
          <option value="limestone">limestone</option>
          <option value="pebbles">pebbles</option>
        </select>
        <textarea
          className="w-full border rounded-md px-3 py-2"
          rows={3}
          placeholder="Description"
          value={pDesc}
          onChange={(e) => setPDesc(e.target.value)}
        />
        <select
          className="w-full border rounded-md px-3 py-2"
          value={pStatus}
          onChange={(e) => setPStatus(e.target.value as typeof pStatus)}
        >
          <option value="draft">draft</option>
          <option value="published">published</option>
        </select>
        <label className="text-sm block">
          Template JSON
          <textarea className="mt-1 w-full font-mono text-xs border rounded-md px-3 py-2" rows={8} value={pTemplate} onChange={(e) => setPTemplate(e.target.value)} />
        </label>
        <input type="file" accept="image/*" onChange={(e) => setPFile(e.target.files?.[0] ?? null)} />
        <button type="button" className="rounded-md bg-emerald-800 text-white px-4 py-2 text-sm" onClick={() => void createProduct()}>
          Create product
        </button>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-medium">Your products</h2>
        {products.length === 0 ? (
          <p className="text-sm text-zinc-600 mt-2">None yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {products.map((p) => (
              <li key={p.id} className="text-sm border rounded-md p-2 flex justify-between gap-2">
                <span>
                  {p.name} <span className="text-zinc-500">({p.status})</span>
                </span>
                <a className="text-sky-700 shrink-0" href={`/products/${p.id}`}>
                  View
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
