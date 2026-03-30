import type { CartItemSelection, CartSelectionDisplayRow } from "@/types/order";
import type { ProductDetail } from "@/types/product";

/** Structured rows for UI (cart cards, etc.). */
export function getCartSelectionRows(
    product: ProductDetail | undefined,
    selections: CartItemSelection[] | undefined
): CartSelectionDisplayRow[] {
    if (!selections?.length) {
        return [];
    }
    const byId = product ? new Map(product.options.map((o) => [o.id, o])) : undefined;
    const rows: CartSelectionDisplayRow[] = [];
    for (const s of selections) {
        const o = byId?.get(s.optionId);
        const label = (s.optionLabel?.trim() || o?.name || "").trim();
        const value = (s.value ?? "").trim();
        if (!value) {
            continue;
        }
        rows.push(label ? { label, value } : { label: "", value });
    }
    return rows;
}

/** Human-readable summary for cart/checkout lines (option name + chosen value). */
export function formatCartSelectionsLine(
    product: ProductDetail | undefined,
    selections: CartItemSelection[] | undefined
): string | null {
    const rows = getCartSelectionRows(product, selections);
    if (rows.length === 0) {
        return null;
    }
    const parts = rows.map((r) => (r.label ? `${r.label}: ${r.value}` : r.value));
    return parts.join(" · ");
}
