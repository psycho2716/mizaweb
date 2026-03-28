import type { ProductOption } from "@/types";

/** Matches backend `PRODUCT_DIMENSIONS_OPTION_NAME`. */
export const DIMENSIONS_OPTION_NAME = "Dimensions";

/** Matches backend `PRODUCT_COLORS_OPTION_NAME`. */
export const COLORS_OPTION_NAME = "Available colors";

export function getProductOptionValues(options: ProductOption[], name: string): string[] {
    const found = options.find((o) => o.name === name);
    return found?.values ?? [];
}
