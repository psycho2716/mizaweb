import { Router } from "express";

import { createAdminSupabaseClient, createAnonSupabaseClient } from "../lib/supabase";

export const catalogRouter = Router();

catalogRouter.get("/", async (req, res) => {
  const category = typeof req.query.category === "string" ? req.query.category : undefined;
  const query = typeof req.query.query === "string" ? req.query.query : undefined;

  const supabase = createAnonSupabaseClient();
  let productsQuery = supabase
    .from("products")
    .select("id,seller_id,name,category,description,primary_image_storage_path,status")
    .eq("status", "published");

  if (category) productsQuery = productsQuery.eq("category", category);
  if (query) productsQuery = productsQuery.ilike("name", `%${query}%`);
  productsQuery = productsQuery.limit(50);

  const { data, error } = await productsQuery;
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.status(200).json({ products: data ?? [] });
});

catalogRouter.get("/:productId", async (req, res) => {
  const supabase = createAnonSupabaseClient();
  const { data: product, error } = await supabase
    .from("products")
    .select("id,seller_id,name,category,description,primary_image_storage_path,status,created_at")
    .eq("id", req.params.productId)
    .maybeSingle();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  if (!product) {
    res.status(404).json({ error: "Product not found." });
    return;
  }

  res.status(200).json({ product });
});

catalogRouter.get("/:productId/template", async (req, res) => {
  const supabase = createAnonSupabaseClient();
  const { data: product } = await supabase.from("products").select("id").eq("id", req.params.productId).maybeSingle();
  if (!product) {
    res.status(404).json({ error: "Product not found." });
    return;
  }

  const { data: tpl, error } = await supabase
    .from("product_customization_templates")
    .select("product_id,schema_json,updated_at")
    .eq("product_id", req.params.productId)
    .maybeSingle();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  if (!tpl) {
    res.status(404).json({ error: "No customization template for this product." });
    return;
  }

  res.status(200).json({ template: tpl });
});

/** Short-lived signed URL for the primary 2D image (published catalog only). */
catalogRouter.get("/:productId/primary-image-signed-url", async (req, res) => {
  const supabase = createAnonSupabaseClient();
  const { data: product, error: pErr } = await supabase
    .from("products")
    .select("primary_image_storage_path")
    .eq("id", req.params.productId)
    .maybeSingle();

  if (pErr) {
    res.status(500).json({ error: pErr.message });
    return;
  }
  if (!product?.primary_image_storage_path) {
    res.status(404).json({ error: "Product not found." });
    return;
  }

  const admin = createAdminSupabaseClient();
  const { data: signed, error: sErr } = await admin.storage
    .from("product-primary-2d")
    .createSignedUrl(product.primary_image_storage_path, 60 * 30);

  if (sErr || !signed?.signedUrl) {
    res.status(500).json({ error: sErr?.message ?? "Could not sign URL." });
    return;
  }

  res.status(200).json({ url: signed.signedUrl });
});
