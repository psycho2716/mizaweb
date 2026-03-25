import { Router } from "express";

import { loadProfileRole, requireBearerUser, requireRole } from "../middleware/bearerAuth";
import { rateLimitKey } from "../lib/rateLimit";
import { parseTemplateSchema, validateAndNormalizeSnapshot } from "../lib/snapshotValidate";

export const customizationsRouter = Router();

customizationsRouter.post("/", requireBearerUser, loadProfileRole, requireRole("customer"), async (req, res) => {
  if (!rateLimitKey(`cust:${req.userId!}`, 120, 60 * 60 * 1000)) {
    res.status(429).json({ error: "Too many customization saves. Try again later." });
    return;
  }

  const supabase = req.supabaseUser!;
  const productId = typeof req.body?.product_id === "string" ? req.body.product_id : "";
  const snapshotRaw = req.body?.snapshot;

  if (!productId) {
    res.status(400).json({ error: "product_id is required." });
    return;
  }

  const { data: product, error: pErr } = await supabase
    .from("products")
    .select("id,seller_id,status")
    .eq("id", productId)
    .eq("status", "published")
    .maybeSingle();

  if (pErr || !product) {
    res.status(404).json({ error: "Published product not found." });
    return;
  }

  const { data: tpl, error: tErr } = await supabase
    .from("product_customization_templates")
    .select("schema_json")
    .eq("product_id", productId)
    .maybeSingle();

  if (tErr || !tpl) {
    res.status(400).json({ error: "Product has no customization template." });
    return;
  }

  let normalized: Record<string, number>;
  try {
    const schema = parseTemplateSchema(tpl.schema_json);
    const out = validateAndNormalizeSnapshot(schema, snapshotRaw);
    normalized = out.normalized;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid snapshot.";
    res.status(400).json({ error: msg });
    return;
  }

  const { data: row, error: iErr } = await supabase
    .from("customizations")
    .insert({
      product_id: productId,
      seller_id: product.seller_id,
      customer_id: req.userId!,
      snapshot_json: normalized,
      status: "submitted",
    })
    .select("id,product_id,seller_id,customer_id,snapshot_json,status,created_at")
    .single();

  if (iErr || !row) {
    res.status(400).json({ error: iErr?.message ?? "Could not save customization." });
    return;
  }

  res.status(201).json({ customization: row });
});

customizationsRouter.get("/:customizationId", requireBearerUser, loadProfileRole, requireRole("customer"), async (req, res) => {
  const supabase = req.supabaseUser!;
  const { data, error } = await supabase
    .from("customizations")
    .select("*")
    .eq("id", req.params.customizationId)
    .maybeSingle();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  if (!data || data.customer_id !== req.userId) {
    res.status(404).json({ error: "Customization not found." });
    return;
  }

  res.status(200).json({ customization: data });
});
