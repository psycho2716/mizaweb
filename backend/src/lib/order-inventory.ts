import { persistProduct } from "../integrations/supabase/persistence";
import { db } from "./store";
import type { ProductRecord } from "../types/domain";

/** Sums order line quantities per product for a single order. */
export function aggregateOrderLineQtyByProduct(orderId: string): Map<string, number> {
    const map = new Map<string, number>();
    for (const line of db.orderLineItems.values()) {
        if (line.orderId !== orderId) {
            continue;
        }
        map.set(line.productId, (map.get(line.productId) ?? 0) + line.quantity);
    }
    return map;
}

/**
 * Validates that in-stock (non–made-to-order) products have enough quantity to confirm the order.
 * @returns An error message, or null if OK.
 */
export function validateStockForOrderDeduction(orderId: string): string | null {
    const qtyByProduct = aggregateOrderLineQtyByProduct(orderId);
    for (const [productId, qty] of qtyByProduct) {
        const p = db.products.get(productId);
        if (!p || p.madeToOrder) {
            continue;
        }
        const stock = p.stockQuantity ?? 0;
        if (stock < qty) {
            return `Insufficient stock for "${p.title}". Available: ${stock}, needed to confirm: ${qty}.`;
        }
    }
    return null;
}

type ProductStockChange = { productId: string; before: ProductRecord; after: ProductRecord };

function collectStockDeductionChanges(orderId: string): ProductStockChange[] {
    const qtyByProduct = aggregateOrderLineQtyByProduct(orderId);
    const changes: ProductStockChange[] = [];
    for (const [productId, qty] of qtyByProduct) {
        const p = db.products.get(productId);
        if (!p || p.madeToOrder) {
            continue;
        }
        const current = p.stockQuantity ?? 0;
        const after: ProductRecord = { ...p, stockQuantity: current - qty };
        changes.push({ productId, before: p, after });
    }
    return changes;
}

function collectStockRestoreChanges(orderId: string): ProductStockChange[] {
    const qtyByProduct = aggregateOrderLineQtyByProduct(orderId);
    const changes: ProductStockChange[] = [];
    for (const [productId, qty] of qtyByProduct) {
        const p = db.products.get(productId);
        if (!p || p.madeToOrder) {
            continue;
        }
        const current = p.stockQuantity ?? 0;
        const after: ProductRecord = { ...p, stockQuantity: current + qty };
        changes.push({ productId, before: p, after });
    }
    return changes;
}

async function applyProductChangesAndPersist(changes: ProductStockChange[]): Promise<void> {
    for (const c of changes) {
        db.products.set(c.productId, c.after);
    }
    try {
        for (const c of changes) {
            await persistProduct(c.after);
        }
    } catch (err) {
        for (const c of changes) {
            db.products.set(c.productId, c.before);
        }
        for (const c of changes) {
            try {
                await persistProduct(c.before);
            } catch (revertErr) {
                console.error("[order-inventory] failed to revert product after error", c.productId, revertErr);
            }
        }
        throw err;
    }
}

/**
 * Deducts catalog stock for all in-stock lines on this order and persists products.
 * Call only when transitioning an order to confirmed (after validation).
 */
export async function deductStockForOrderAndPersist(orderId: string): Promise<void> {
    const validationError = validateStockForOrderDeduction(orderId);
    if (validationError) {
        throw new Error(validationError);
    }
    const changes = collectStockDeductionChanges(orderId);
    if (changes.length === 0) {
        return;
    }
    await applyProductChangesAndPersist(changes);
}

/**
 * Returns previously deducted stock to catalog for this order (e.g. after cancel when the order had been confirmed).
 */
export async function restoreStockForOrderAndPersist(orderId: string): Promise<void> {
    const changes = collectStockRestoreChanges(orderId);
    if (changes.length === 0) {
        return;
    }
    await applyProductChangesAndPersist(changes);
}
