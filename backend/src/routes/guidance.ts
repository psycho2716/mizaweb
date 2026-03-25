import { Router } from "express";

import { loadProfileRole, requireBearerUser, requireRole } from "../middleware/bearerAuth";
import { buildGuidanceFromSnapshot } from "../lib/recommendations";
import { rateLimitKey } from "../lib/rateLimit";
import { parseTemplateSchema, validateAndNormalizeSnapshot } from "../lib/snapshotValidate";

export const guidanceRouter = Router();

guidanceRouter.post("/recommendations", requireBearerUser, loadProfileRole, requireRole("customer"), async (req, res) => {
  if (!rateLimitKey(`guide:${req.userId!}`, 200, 60 * 60 * 1000)) {
    res.status(429).json({ error: "Too many guidance requests. Try again later." });
    return;
  }

  const supabase = req.supabaseUser!;
  const productId = typeof req.body?.product_id === "string" ? req.body.product_id : "";
  const snapshotRaw = req.body?.snapshot;

  if (!productId) {
    res.status(400).json({ error: "product_id is required." });
    return;
  }

  const { data: product } = await supabase.from("products").select("id").eq("id", productId).eq("status", "published").maybeSingle();
  if (!product) {
    res.status(404).json({ error: "Published product not found." });
    return;
  }

  const { data: tpl, error: tErr } = await supabase
    .from("product_customization_templates")
    .select("schema_json")
    .eq("product_id", productId)
    .maybeSingle();

  if (tErr || !tpl) {
    res.status(400).json({ error: "No template for this product." });
    return;
  }

  try {
    const schema = parseTemplateSchema(tpl.schema_json);
    const { normalized } = validateAndNormalizeSnapshot(schema, snapshotRaw);
    const tips = buildGuidanceFromSnapshot(schema, normalized);
    res.status(200).json({ tips, normalized });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid snapshot.";
    res.status(400).json({ error: msg });
  }
});
