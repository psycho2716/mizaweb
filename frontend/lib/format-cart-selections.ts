import type { CartItemSelection } from "@/types/order";
import type { ProductDetail } from "@/types/product";

/** Human-readable summary for cart/checkout lines (option name + chosen value). */
export function formatCartSelectionsLine(
    product: ProductDetail | undefined,
    selections: CartItemSelection[] | undefined
): string | null {
    if (!product || !selections?.length) {
        return null;
    }
    const byId = new Map(product.options.map((o) => [o.id, o]));
    const parts: string[] = [];
    for (const s of selections) {
        const o = byId.get(s.optionId);
        parts.push(o ? `${o.name}: ${s.value}` : s.value);
    }
    return parts.length > 0 ? parts.join(" · ") : null;
}
