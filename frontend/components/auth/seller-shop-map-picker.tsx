"use client";

import { APIProvider, Map, Marker, useMap } from "@vis.gl/react-google-maps";
import { useEffect } from "react";
import { getGoogleMapsBrowserApiKey } from "@/lib/utils";
import type { SellerShopMapPickerProps } from "@/types";

/** Approximate geographic center of the Philippines for the default map view. */
const PH_CENTER = { lat: 12.8797, lng: 121.774 };

function RecenterWhenPinned({ lat, lng }: { lat: number; lng: number }) {
    const map = useMap();
    useEffect(() => {
        if (!map) return;
        map.panTo({ lat, lng });
        const z = map.getZoom();
        if (z !== undefined && z < 15) {
            map.setZoom(15);
        }
    }, [lat, lng, map]);
    return null;
}

function SellerShopMapPicker({
    latitude,
    longitude,
    onPositionChange,
    error
}: SellerShopMapPickerProps) {
    const apiKey = getGoogleMapsBrowserApiKey();

    const hasPin =
        latitude !== undefined &&
        longitude !== undefined &&
        Number.isFinite(latitude) &&
        Number.isFinite(longitude);
    const position = hasPin ? { lat: latitude, lng: longitude } : null;

    if (!apiKey) {
        return (
            <div className="space-y-2 md:col-span-2">
                <div>
                    <p className="text-xs uppercase tracking-[0.14em] text-(--muted)">
                        Pin your shop on the map
                    </p>
                    <p className="mt-1 text-xs text-(--muted)">
                        The map needs a Google Maps setup from whoever runs the website. Until then,
                        buyers still see your written address.
                    </p>
                </div>
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90">
                    <p className="font-medium text-amber-50">Map not available yet</p>
                    <p className="mt-1 text-xs leading-relaxed text-amber-100/85">
                        For developers: add{" "}
                        <code className="rounded bg-black/20 px-1 py-0.5 font-mono text-[11px]">
                            NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
                        </code>{" "}
                        in{" "}
                        <code className="rounded bg-black/20 px-1 py-0.5 font-mono text-[11px]">
                            .env.local
                        </code>{" "}
                        and turn on the Maps JavaScript API for that key in Google Cloud.
                    </p>
                </div>
                {error ? <p className="text-sm text-red-400">{error}</p> : null}
            </div>
        );
    }

    return (
        <div className="space-y-2 md:col-span-2">
            <div>
                <p className="text-xs uppercase tracking-[0.14em] text-(--muted)">
                    Pin your shop on the map
                </p>
                <p className="mt-1 text-xs text-(--muted)">
                    Click where your shop or showroom is. Drag the pin if you need to adjust it.
                </p>
            </div>
            <APIProvider apiKey={apiKey}>
                <div
                    className={`relative z-0 h-64 w-full overflow-hidden rounded-md border ${
                        error ? "border-red-500/60" : "border-(--border)"
                    }`}
                >
                    <Map
                        defaultCenter={PH_CENTER}
                        defaultZoom={6}
                        gestureHandling="greedy"
                        style={{ width: "100%", height: "100%" }}
                        onClick={(e) => {
                            const ll = e.detail.latLng;
                            if (ll) {
                                onPositionChange(ll.lat, ll.lng);
                            }
                        }}
                    >
                        {position ? (
                            <>
                                <RecenterWhenPinned lat={position.lat} lng={position.lng} />
                                <Marker
                                    position={position}
                                    draggable
                                    onDragEnd={(ev) => {
                                        const ll = ev.latLng;
                                        if (ll) {
                                            onPositionChange(ll.lat(), ll.lng());
                                        }
                                    }}
                                />
                            </>
                        ) : null}
                    </Map>
                </div>
            </APIProvider>
            {error ? <p className="text-sm text-red-400">{error}</p> : null}
        </div>
    );
}

export default SellerShopMapPicker;
export { SellerShopMapPicker };
