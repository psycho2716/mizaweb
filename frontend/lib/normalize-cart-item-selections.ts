import type { CartItemSelection } from "@/types/order";

/**
 * Coerce order/cart line `selections` from the API or storage into `{ optionId, value }[]`.
 * Accepts camelCase or snake_case keys, stringified JSON arrays, and non-string values.
 */
export function normalizeCartItemSelections(raw: unknown): CartItemSelection[] {
    let parsed: unknown = raw;
    if (typeof raw === "string") {
        try {
            parsed = JSON.parse(raw) as unknown;
        } catch {
            return [];
        }
    }
    if (!Array.isArray(parsed)) {
        return [];
    }
    const out: CartItemSelection[] = [];
    for (const x of parsed) {
        if (!x || typeof x !== "object") {
            continue;
        }
        const r = x as Record<string, unknown>;
        const optionId =
            typeof r.optionId === "string"
                ? r.optionId
                : typeof r.option_id === "string"
                  ? r.option_id
                  : null;
        const valueRaw = r.value;
        const value =
            typeof valueRaw === "string"
                ? valueRaw
                : valueRaw !== undefined && valueRaw !== null
                  ? String(valueRaw)
                  : null;
        if (!optionId || value === null || value === "") {
            continue;
        }
        const labelRaw =
            typeof r.optionLabel === "string"
                ? r.optionLabel
                : typeof r.option_label === "string"
                  ? r.option_label
                  : "";
        const row: CartItemSelection = { optionId, value };
        const ol = labelRaw.trim();
        if (ol) {
            row.optionLabel = ol;
        }
        out.push(row);
    }
    return out;
}
