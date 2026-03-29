"use client";

import { useCallback, useEffect, useState } from "react";
import { getCart } from "@/lib/api/endpoints";
import { MIZA_CART_CHANGE_EVENT } from "@/lib/cart-events";

/**
 * Total units in cart (sum of line quantities). Refetches on auth change and cart mutations.
 */
export function useCartItemCount(enabled: boolean): number {
    const [count, setCount] = useState(0);

    const refresh = useCallback(async () => {
        if (!enabled) {
            setCount(0);
            return;
        }
        try {
            const { data } = await getCart();
            const total = data.reduce((sum, row) => sum + row.quantity, 0);
            setCount(total);
        } catch {
            setCount(0);
        }
    }, [enabled]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    useEffect(() => {
        const onAuth = () => {
            void refresh();
        };
        const onCart = () => {
            void refresh();
        };
        window.addEventListener("miza-auth-change", onAuth);
        window.addEventListener(MIZA_CART_CHANGE_EVENT, onCart);
        return () => {
            window.removeEventListener("miza-auth-change", onAuth);
            window.removeEventListener(MIZA_CART_CHANGE_EVENT, onCart);
        };
    }, [refresh]);

    return count;
}
