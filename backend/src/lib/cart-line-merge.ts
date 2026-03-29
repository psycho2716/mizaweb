import type { CartItem, CartItemSelection, ProductRecord } from "../types/domain";

/** Stable compare for merge (same product + same chosen options). */
export function cartSelectionsEqual(a: CartItemSelection[], b: CartItemSelection[]): boolean {
    const key = (s: CartItemSelection[]) =>
        [...s]
            .sort((x, y) => x.optionId.localeCompare(y.optionId))
            .map((x) => `${x.optionId}\0${x.value}`)
            .join("\n");
    return key(a) === key(b);
}

export function maxPurchasableUnits(product: ProductRecord): number | null {
    if (product.madeToOrder) {
        return null;
    }
    if (typeof product.stockQuantity !== "number" || product.stockQuantity < 0) {
        return 0;
    }
    return product.stockQuantity;
}

export function ownerCartItems(
    items: Iterable<CartItem>,
    authUserId: string | null,
    guestSessionId: string | null
): CartItem[] {
    return [...items].filter((entry) =>
        authUserId ? entry.buyerId === authUserId : entry.guestSessionId === guestSessionId
    );
}

export function totalQuantityForProduct(lines: CartItem[], productId: string): number {
    return lines.reduce((sum, line) => (line.productId === productId ? sum + line.quantity : sum), 0);
}
