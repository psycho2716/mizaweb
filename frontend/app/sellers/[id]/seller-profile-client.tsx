"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { backendFetchJson } from "@/lib/backend-api";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

interface SellerProfileClientProps {
  sellerId: string;
}

interface LocationRes {
  location: { shop_lat: number; shop_lng: number; shop_label: string | null };
}

export function SellerProfileClient({ sellerId }: SellerProfileClientProps) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [loc, setLoc] = useState<LocationRes["location"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [oLat, setOLat] = useState("");
  const [oLng, setOLng] = useState("");
  const [eta, setEta] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await backendFetchJson<LocationRes>(`/maps/sellers/${sellerId}/location`);
        if (!cancelled) setLoc(res.location);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "No location.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sellerId]);

  const refreshSession = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    setToken(data.session?.access_token ?? null);
    const uid = data.session?.user.id;
    if (!uid) {
      setRole(null);
      return;
    }
    const { data: prof } = await supabase.from("profiles").select("role").eq("id", uid).maybeSingle();
    setRole(typeof prof?.role === "string" ? prof.role : null);
  }, [supabase]);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation not available.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setOLat(String(pos.coords.latitude));
        setOLng(String(pos.coords.longitude));
        toast.success("Origin set from device location.");
      },
      () => toast.error("Could not read location.")
    );
  };

  const directions = async () => {
    if (!loc) return;
    if (!token || role !== "customer") {
      toast.error("Sign in as a customer to estimate directions.");
      return;
    }
    const lat = Number(oLat);
    const lng = Number(oLng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      toast.error("Set origin latitude and longitude.");
      return;
    }
    try {
      const res = await backendFetchJson<{ distance_text?: string; duration_text?: string }>("/maps/directions", {
        method: "POST",
        accessToken: token,
        body: JSON.stringify({
          origin_lat: lat,
          origin_lng: lng,
          dest_lat: loc.shop_lat,
          dest_lng: loc.shop_lng,
        }),
      });
      setEta([res.distance_text, res.duration_text].filter(Boolean).join(" · ") || "No summary.");
      toast.success("Route summary updated.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Directions failed.");
    }
  };

  if (error && !loc) {
    return <p className="text-zinc-600">{error}</p>;
  }
  if (!loc) {
    return <p className="text-zinc-600">Loading map…</p>;
  }

  const bbox = `${loc.shop_lng - 0.02},${loc.shop_lat - 0.02},${loc.shop_lng + 0.02},${loc.shop_lat + 0.02}`;
  const embed = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${loc.shop_lat},${loc.shop_lng}`;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">Shop location</h2>
        {loc.shop_label ? <p className="text-sm text-zinc-600 mt-1">{loc.shop_label}</p> : null}
        <p className="text-xs font-mono text-zinc-500 mt-1">
          {loc.shop_lat.toFixed(5)}, {loc.shop_lng.toFixed(5)}
        </p>
        <a
          className="text-sm text-sky-700 mt-2 inline-block"
          href={`https://www.google.com/maps?q=${loc.shop_lat},${loc.shop_lng}`}
          target="_blank"
          rel="noreferrer"
        >
          Open in Google Maps
        </a>
      </div>

      <iframe title="Map" className="w-full h-72 rounded-xl border border-zinc-200" src={embed} />

      <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-3">
        <h3 className="font-medium">Directions estimate (Google via backend)</h3>
        <p className="text-xs text-zinc-500">Requires GOOGLE_MAPS_API_KEY on the server. Customer sign-in only.</p>
        <div className="grid sm:grid-cols-2 gap-2">
          <input className="border rounded-md px-3 py-2 text-sm" placeholder="Origin lat" value={oLat} onChange={(e) => setOLat(e.target.value)} />
          <input className="border rounded-md px-3 py-2 text-sm" placeholder="Origin lng" value={oLng} onChange={(e) => setOLng(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm" onClick={useMyLocation}>
            Use my location
          </button>
          <button type="button" className="rounded-md bg-zinc-900 text-white px-3 py-1.5 text-sm" onClick={() => void directions()}>
            Get estimate
          </button>
        </div>
        {eta ? <p className="text-sm text-zinc-800">{eta}</p> : null}
      </div>
    </div>
  );
}
