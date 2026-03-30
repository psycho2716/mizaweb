import { db } from "./store";
import type { CartItemSelection } from "../types/domain";

/**
 * Validates POST /cart/items `selections` against `app_customization_options` for the product.
 * When the product has options, `raw` must be an array with exactly one entry per option.
 */
export function parseAndValidateCartSelections(
    productId: string,
    raw: unknown
): { ok: true; selections: CartItemSelection[] } | { ok: false; error: string } {
    const options = [...db.customizationOptions.values()].filter((o) => o.productId === productId);

    if (options.length === 0) {
        if (raw === undefined || raw === null) {
            return { ok: true, selections: [] };
        }
        if (Array.isArray(raw) && raw.length === 0) {
            return { ok: true, selections: [] };
        }
        return { ok: false, error: "This product has no customization options" };
    }

    if (raw === undefined || raw === null) {
        return { ok: false, error: "selections is required for this product" };
    }
    if (!Array.isArray(raw)) {
        return { ok: false, error: "selections must be an array" };
    }

    const byId = new Map(options.map((o) => [o.id, o]));
    const out: CartItemSelection[] = [];
    const seenOptionIds = new Set<string>();

    for (const entry of raw) {
        if (!entry || typeof entry !== "object") {
            return { ok: false, error: "Invalid selections entry" };
        }
        const rec = entry as { optionId?: unknown; value?: unknown };
        if (typeof rec.optionId !== "string" || typeof rec.value !== "string") {
            return { ok: false, error: "Each selection needs optionId and value strings" };
        }
        const opt = byId.get(rec.optionId);
        if (!opt) {
            return { ok: false, error: "Unknown option for this product" };
        }
        if (!opt.values.includes(rec.value)) {
            return { ok: false, error: `Invalid value for ${opt.name}` };
        }
        if (seenOptionIds.has(rec.optionId)) {
            return { ok: false, error: "Duplicate option in selections" };
        }
        seenOptionIds.add(rec.optionId);
        out.push({ optionId: rec.optionId, value: rec.value });
    }

    if (out.length !== options.length) {
        return { ok: false, error: "Each customization option must be selected exactly once" };
    }
    for (const o of options) {
        if (!seenOptionIds.has(o.id)) {
            return { ok: false, error: "Each customization option must be selected exactly once" };
        }
    }
    return { ok: true, selections: out };
}

/**
 * Adds `optionLabel` from the current catalog so order line `selections` stay readable
 * if the seller renames or removes customization options after purchase.
 */
export function snapshotSelectionsForOrderLine(
    productId: string,
    selections: CartItemSelection[]
): CartItemSelection[] {
    const options = [...db.customizationOptions.values()].filter((o) => o.productId === productId);
    const byId = new Map(options.map((o) => [o.id, o]));
    return selections.map((s) => {
        const opt = byId.get(s.optionId);
        const name = opt?.name?.trim();
        const base: CartItemSelection = { optionId: s.optionId, value: s.value };
        if (name) {
            return { ...base, optionLabel: name };
        }
        const existing = s.optionLabel?.trim();
        return existing ? { ...base, optionLabel: existing } : base;
    });
}
