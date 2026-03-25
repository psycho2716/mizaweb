export type ProductCategory = "marble" | "limestone" | "pebbles";

export interface ProductSummary {
  id: string;
  seller_id: string;
  name: string;
  category: ProductCategory;
  description: string;
  primary_image_storage_path: string;
  status?: "draft" | "published";
}

export interface ProductDetail extends ProductSummary {
  status: "draft" | "published";
  created_at: string;
}

export interface TemplateFieldDto {
  key: string;
  type: "number";
  unit?: "mm" | "cm" | "m";
  min?: number;
  max?: number;
  required?: boolean;
}

export interface CustomizationTemplateDto {
  product_id: string;
  schema_json: {
    version?: number;
    fields: TemplateFieldDto[];
  };
  updated_at: string;
}

