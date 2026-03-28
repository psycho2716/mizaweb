import { deleteCustomizationOptionById, persistCustomizationOption } from "../integrations/supabase/persistence";
import { db } from "./store";
import type { CustomizationOption } from "../types/domain";

export const PRODUCT_DIMENSIONS_OPTION_NAME = "Dimensions";
export const PRODUCT_COLORS_OPTION_NAME = "Available colors";

/**
 * Maps 3D picker choices to `app_customization_options` rows for this product.
 * Awaited before API success so a subsequent `syncFromSupabaseIfStale` reload keeps options.
 */
export async function syncProductDimensionAndColorOptions(
    productId: string,
    dimensionChoices: string[],
    colorChoices: string[]
): Promise<void> {
    const dims = [...new Set(dimensionChoices.map((s) => s.trim()).filter(Boolean))];
    const colors = [...new Set(colorChoices.map((s) => s.trim()).filter(Boolean))];

    const forProduct = [...db.customizationOptions.values()].filter((o) => o.productId === productId);

    const apply = async (name: string, values: string[]) => {
        const existing = forProduct.find((o) => o.name === name);
        if (values.length === 0) {
            if (existing) {
                db.customizationOptions.delete(existing.id);
                await deleteCustomizationOptionById(existing.id);
            }
            return;
        }
        if (existing) {
            existing.values = values;
            await persistCustomizationOption(existing);
            return;
        }
        const id = `co-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        const option: CustomizationOption = { id, productId, name, values };
        db.customizationOptions.set(id, option);
        await persistCustomizationOption(option);
    };

    await apply(PRODUCT_DIMENSIONS_OPTION_NAME, dims);
    await apply(PRODUCT_COLORS_OPTION_NAME, colors);
}
