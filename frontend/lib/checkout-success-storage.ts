import type { CheckoutSuccessDisplayMeta } from "@/types";

const PREFIX = "miza_checkout_success_";

export function checkoutSuccessStorageKey(orderId: string): string {
    return `${PREFIX}${orderId}`;
}

export function readCheckoutSuccessMeta(orderId: string): CheckoutSuccessDisplayMeta | null {
    if (typeof window === "undefined") {
        return null;
    }
    try {
        const raw = sessionStorage.getItem(checkoutSuccessStorageKey(orderId));
        if (!raw) {
            return null;
        }
        return JSON.parse(raw) as CheckoutSuccessDisplayMeta;
    } catch {
        return null;
    }
}

export function writeCheckoutSuccessMeta(
    orderId: string,
    meta: CheckoutSuccessDisplayMeta
): void {
    if (typeof window === "undefined") {
        return;
    }
    try {
        sessionStorage.setItem(checkoutSuccessStorageKey(orderId), JSON.stringify(meta));
    } catch {
        /* quota or private mode */
    }
}
