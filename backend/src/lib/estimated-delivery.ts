/** Buyer-facing delivery window (+7 / +14 calendar days from placement) when the client does not send estimates. */
export function defaultEstimatedDeliveryFromPlacedAt(createdAtIso: string): {
    estimatedDeliveryStartAt: string;
    estimatedDeliveryEndAt: string;
    estimatedDeliveryRangeDisplay: string;
} {
    const base = new Date(createdAtIso);
    const start = new Date(base);
    start.setUTCDate(start.getUTCDate() + 7);
    start.setUTCHours(12, 0, 0, 0);
    const end = new Date(base);
    end.setUTCDate(end.getUTCDate() + 14);
    end.setUTCHours(12, 0, 0, 0);
    const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
    const estimatedDeliveryRangeDisplay = `${start.toLocaleDateString("en-US", opts)} – ${end.toLocaleDateString("en-US", opts)}`;
    return {
        estimatedDeliveryStartAt: start.toISOString(),
        estimatedDeliveryEndAt: end.toISOString(),
        estimatedDeliveryRangeDisplay
    };
}

export interface EstimatedDeliveryInput {
    estimatedDeliveryStartAt?: string;
    estimatedDeliveryEndAt?: string;
    estimatedDeliveryRangeDisplay?: string;
}

export function resolveEstimatedDeliveryForOrder(
    createdAtIso: string,
    body: EstimatedDeliveryInput
): {
    estimatedDeliveryStartAt: string;
    estimatedDeliveryEndAt: string;
    estimatedDeliveryRangeDisplay: string;
} {
    const s = body.estimatedDeliveryStartAt;
    const e = body.estimatedDeliveryEndAt;
    const r = body.estimatedDeliveryRangeDisplay?.trim();
    if (s && e && r) {
        const ds = new Date(s);
        const de = new Date(e);
        if (
            Number.isFinite(ds.getTime()) &&
            Number.isFinite(de.getTime()) &&
            de.getTime() >= ds.getTime() &&
            r.length <= 220
        ) {
            return {
                estimatedDeliveryStartAt: ds.toISOString(),
                estimatedDeliveryEndAt: de.toISOString(),
                estimatedDeliveryRangeDisplay: r
            };
        }
    }
    return defaultEstimatedDeliveryFromPlacedAt(createdAtIso);
}
