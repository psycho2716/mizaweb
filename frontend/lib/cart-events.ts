/** Fired after cart mutations so chrome (e.g. header badge) can refetch counts. */
export const MIZA_CART_CHANGE_EVENT = "miza-cart-change";

export function dispatchCartChanged(): void {
    if (typeof window === "undefined") {
        return;
    }
    window.dispatchEvent(new Event(MIZA_CART_CHANGE_EVENT));
}
