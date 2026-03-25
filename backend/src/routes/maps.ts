import { Router } from "express";

import { env } from "../lib/env";
import { createAnonSupabaseClient } from "../lib/supabase";
import { loadProfileRole, requireBearerUser, requireRole } from "../middleware/bearerAuth";

export const mapsRouter = Router();

mapsRouter.get("/sellers/:sellerId/location", async (req, res) => {
  const supabase = createAnonSupabaseClient();
  const { data, error } = await supabase
    .from("seller_locations")
    .select("seller_id,shop_lat,shop_lng,shop_label")
    .eq("seller_id", req.params.sellerId)
    .maybeSingle();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  if (!data) {
    res.status(404).json({ error: "Location not found." });
    return;
  }

  res.status(200).json({ location: data });
});

mapsRouter.post("/directions", requireBearerUser, loadProfileRole, requireRole("customer"), async (req, res) => {
  const key = env.GOOGLE_MAPS_API_KEY?.trim();
  if (!key) {
    res.status(503).json({ error: "Google Maps is not configured on the server." });
    return;
  }

  const oLat = Number(req.body?.origin_lat);
  const oLng = Number(req.body?.origin_lng);
  const dLat = Number(req.body?.dest_lat);
  const dLng = Number(req.body?.dest_lng);

  if ([oLat, oLng, dLat, dLng].some((n) => Number.isNaN(n))) {
    res.status(400).json({ error: "origin_lat, origin_lng, dest_lat, dest_lng must be numbers." });
    return;
  }

  const origin = `${oLat},${oLng}`;
  const destination = `${dLat},${dLng}`;
  const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
  url.searchParams.set("origin", origin);
  url.searchParams.set("destination", destination);
  url.searchParams.set("key", key);

  const gRes = await fetch(url.toString());
  const json = (await gRes.json()) as {
    status: string;
    routes?: Array<{ legs: Array<{ distance: { text: string }; duration: { text: string } }> }>;
    error_message?: string;
  };

  if (json.status !== "OK" || !json.routes?.length) {
    res.status(400).json({
      error: json.error_message ?? json.status ?? "No route found.",
    });
    return;
  }

  const leg = json.routes[0].legs[0];
  res.status(200).json({
    distance_text: leg?.distance?.text,
    duration_text: leg?.duration?.text,
  });
});
