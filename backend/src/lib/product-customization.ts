import { deleteCustomizationOptionById, persistCustomizationOption } from "../integrations/supabase/persistence";
import { db } from "./store";
import type { CustomizationOption } from "../types/domain";

export const PRODUCT_DIMENSIONS_OPTION_NAME = "Dimensions";
export const PRODUCT_COLORS_OPTION_NAME = "Available colors";

/**
 * Maps 3D picker choices to `app_customization_options` rows for this product.
 */
export function syncProductDimensionAndColorOptions(
    productId: string,
    dimensionChoices: string[],
    colorChoices: string[]
): void {
    const dims = [...new Set(dimensionChoices.map((s) => s.trim()).filter(Boolean))];
    const colors = [...new Set(colorChoices.map((s) => s.trim()).filter(Boolean))];

    const forProduct = [...db.customizationOptions.values()].filter((o) => o.productId === productId);

    const apply = (name: string, values: string[]) => {
        const existing = forProduct.find((o) => o.name === name);
        if (values.length === 0) {
            if (existing) {
                db.customizationOptions.delete(existing.id);
                deleteCustomizationOptionById(existing.id);
            }
            return;
        }
        if (existing) {
            existing.values = values;
            persistCustomizationOption(existing);
            return;
        }
        const id = `co-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        const option: CustomizationOption = { id, productId, name, values };
        db.customizationOptions.set(id, option);
        persistCustomizationOption(option);
    };

    apply(PRODUCT_DIMENSIONS_OPTION_NAME, dims);
    apply(PRODUCT_COLORS_OPTION_NAME, colors);
}
