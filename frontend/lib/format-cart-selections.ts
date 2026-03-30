import type { CartItemSelection } from "@/types/order";
import type { ProductDetail } from "@/types/product";

/** Human-readable summary for cart/checkout lines (option name + chosen value). */
export function formatCartSelectionsLine(
    product: ProductDetail | undefined,
    selections: CartItemSelection[] | undefined
): string | null {
    if (!selections?.length) {
        return null;
    }
    const byId = product ? new Map(product.options.map((o) => [o.id, o])) : undefined;
    const parts: string[] = [];
    for (const s of selections) {
        const o = byId?.get(s.optionId);
        const label = s.optionLabel?.trim() || o?.name;
        parts.push(label ? `${label}: ${s.value}` : s.value);
    }
    return parts.length > 0 ? parts.join(" · ") : null;
}
