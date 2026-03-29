"use client";

import { APIProvider, Map, Marker, useMap } from "@vis.gl/react-google-maps";
import { useEffect } from "react";
import { cn, getGoogleMapsBrowserApiKey } from "@/lib/utils";
import type { AdminSellerLocationMapProps } from "@/types";

function CenterOnPin({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    map.panTo({ lat, lng });
    const z = map.getZoom();
    if (z !== undefined && z < 14) {
      map.setZoom(15);
    }
  }, [lat, lng, map]);
  return null;
}

export function AdminSellerLocationMap({
  latitude,
  longitude,
  address,
  className,
  sectionHeading = "Shop location",
  mapFrameClassName = "relative z-0 h-44 w-full overflow-hidden rounded-md border border-(--border)",
  showSectionLabel = true,
}: AdminSellerLocationMapProps) {
  const apiKey = getGoogleMapsBrowserApiKey();

  const hasCoords =
    latitude !== undefined &&
    longitude !== undefined &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude);

  const queryLink = hasCoords
    ? `https://www.google.com/maps?q=${latitude},${longitude}`
    : address && address.trim()
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.trim())}`
      : null;

  return (
    <div className={cn("space-y-2", className)}>
      {showSectionLabel ? (
        <p className="text-[10px] font-semibold uppercase tracking-wider text-(--muted)">
          {sectionHeading}
        </p>
      ) : null}

      {!hasCoords ? (
        <div className="rounded-md border border-(--border) bg-[#080b10]/60 px-3 py-2 text-xs text-(--muted)">
          <p>No map pin saved yet. The seller can add one in account settings.</p>
          {queryLink ? (
            <a
              href={queryLink}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block font-medium text-(--accent) hover:underline"
            >
              Open in Google Maps
            </a>
          ) : null}
        </div>
      ) : !apiKey ? (
        <div className="rounded-md border border-(--border) bg-[#080b10]/60 px-3 py-2 text-xs text-(--muted)">
          <p className="tabular-nums">
            Location: {latitude.toFixed(5)}, {longitude.toFixed(5)}
          </p>
          <p className="mt-1">
            Embedded map needs a Google Maps key in site settings. Use the link below to view the
            location.
          </p>
          {queryLink ? (
            <a
              href={queryLink}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block font-medium text-(--accent) hover:underline"
            >
              Open in Google Maps
            </a>
          ) : null}
        </div>
      ) : (
        <>
          <APIProvider apiKey={apiKey}>
            <div className={mapFrameClassName}>
              <Map
                defaultCenter={{ lat: latitude, lng: longitude }}
                defaultZoom={15}
                gestureHandling="greedy"
                style={{ width: "100%", height: "100%" }}
              >
                <CenterOnPin lat={latitude} lng={longitude} />
                <Marker position={{ lat: latitude, lng: longitude }} />
              </Map>
            </div>
          </APIProvider>
          {queryLink ? (
            <a
              href={queryLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-xs font-medium text-(--accent) hover:underline"
            >
              Open in Google Maps
            </a>
          ) : null}
        </>
      )}
    </div>
  );
}
