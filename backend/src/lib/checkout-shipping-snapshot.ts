import type { OrderRecord } from "../types/domain";

export interface CheckoutShippingBody {
    shippingRecipientName?: string;
    shippingContactNumber?: string;
    shippingAddressLine?: string;
    shippingCity?: string;
    shippingPostalCode?: string;
    deliveryNotes?: string;
}

/** Normalizes optional checkout fields into order snapshot properties (empty input → omitted). */
export function checkoutShippingSnapshotFromBody(body: CheckoutShippingBody): Partial<OrderRecord> {
    const name = body.shippingRecipientName?.trim();
    const line = body.shippingAddressLine?.trim();
    const city = body.shippingCity?.trim();
    const postalDigits = body.shippingPostalCode?.replace(/\D/g, "") ?? "";
    const contactDigits = body.shippingContactNumber?.replace(/\D/g, "") ?? "";
    const notes = body.deliveryNotes?.trim();

    const out: Partial<OrderRecord> = {};
    if (name && name.length >= 2) {
        out.shippingRecipientName = name.slice(0, 120);
    }
    if (contactDigits.length >= 10) {
        out.shippingContactNumber = contactDigits.slice(0, 20);
    }
    if (line && line.length >= 3) {
        out.shippingAddressLine = line.slice(0, 255);
    }
    if (city && city.length >= 1) {
        out.shippingCity = city.slice(0, 120);
    }
    if (postalDigits.length >= 4) {
        out.shippingPostalCode = postalDigits.slice(0, 12);
    }
    if (notes && notes.length > 0) {
        out.deliveryNotes = notes.slice(0, 2000);
    }
    return out;
}
