export type ProductCategory = "marble" | "limestone" | "pebbles";

export interface ProductSummary {
  id: string;
  seller_id: string;
  name: string;
  category: ProductCategory;
  description: string;
  primary_image_storage_path: string;
}

