import { createHash, randomUUID } from "crypto";
import { Router } from "express";
import multer from "multer";

import { loadProfileRole, requireBearerUser, requireRole } from "../middleware/bearerAuth";
import { createAdminSupabaseClient } from "../lib/supabase";
import { parseTemplateSchema } from "../lib/snapshotValidate";

export const sellerRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
});

sellerRouter.use(requireBearerUser, loadProfileRole, requireRole("seller"));

sellerRouter.get("/me", async (req, res) => {
  const supabase = req.supabaseUser!;
  const { data: profile, error: pErr } = await supabase.from("profiles").select("*").eq("id", req.userId!).maybeSingle();
  if (pErr) {
    res.status(500).json({ error: pErr.message });
    return;
  }

  const { data: verification } = await supabase.from("seller_verifications").select("*").eq("seller_id", req.userId!).maybeSingle();
  const { data: location } = await supabase.from("seller_locations").select("*").eq("seller_id", req.userId!).maybeSingle();

  res.status(200).json({ profile, verification: verification ?? null, location: location ?? null });
});

sellerRouter.post("/permit", upload.single("permit"), async (req, res) => {
  if (!req.file?.buffer) {
    res.status(400).json({ error: "permit file is required (field name: permit)." });
    return;
  }

  const admin = createAdminSupabaseClient();
  const { data: existing } = await admin.from("seller_verifications").select("status").eq("seller_id", req.userId!).maybeSingle();
  if (existing?.status === "approved") {
    res.status(400).json({ error: "Seller is already approved." });
    return;
  }

  const ext = req.file.originalname.includes(".") ? req.file.originalname.split(".").pop() : "bin";
  const path = `${req.userId}/permit-${Date.now()}.${ext}`;

  const { error: upErr } = await admin.storage.from("seller-permits").upload(path, req.file.buffer, {
    contentType: req.file.mimetype || "application/octet-stream",
    upsert: true,
  });
  if (upErr) {
    res.status(500).json({ error: upErr.message });
    return;
  }

  const { error: vErr } = await admin.from("seller_verifications").upsert(
    {
      seller_id: req.userId!,
      permit_storage_path: path,
      status: "pending",
      admin_notes: null,
      reviewed_by_admin_id: null,
      reviewed_at: null,
    },
    { onConflict: "seller_id" }
  );

  if (vErr) {
    res.status(500).json({ error: vErr.message });
    return;
  }

  res.status(201).json({ permit_storage_path: path, status: "pending" });
});

sellerRouter.post("/location", async (req, res) => {
  const lat = Number(req.body?.shop_lat);
  const lng = Number(req.body?.shop_lng);
  const shopLabel = typeof req.body?.shop_label === "string" ? req.body.shop_label : null;

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    res.status(400).json({ error: "shop_lat and shop_lng must be numbers." });
    return;
  }

  const supabase = req.supabaseUser!;
  const { data, error } = await supabase
    .from("seller_locations")
    .upsert(
      {
        seller_id: req.userId!,
        shop_lat: lat,
        shop_lng: lng,
        shop_label: shopLabel,
      },
      { onConflict: "seller_id" }
    )
    .select("*")
    .single();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  res.status(200).json({ location: data });
});

sellerRouter.post("/products", upload.single("primary_image"), async (req, res) => {
  if (!req.file?.buffer) {
    res.status(400).json({ error: "primary_image file is required." });
    return;
  }

  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const category = req.body?.category;
  const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";
  const status = req.body?.status === "published" ? "published" : "draft";
  const templateSchemaRaw = req.body?.template_schema;

  if (!name || !description) {
    res.status(400).json({ error: "name and description are required." });
    return;
  }

  if (category !== "marble" && category !== "limestone" && category !== "pebbles") {
    res.status(400).json({ error: "category must be marble, limestone, or pebbles." });
    return;
  }

  let parsedTemplate: unknown = { version: 1, fields: [] };
  if (templateSchemaRaw !== undefined && templateSchemaRaw !== "") {
    try {
      parsedTemplate = typeof templateSchemaRaw === "string" ? JSON.parse(templateSchemaRaw) : templateSchemaRaw;
      parseTemplateSchema(parsedTemplate);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Invalid template_schema.";
      res.status(400).json({ error: msg });
      return;
    }
  }

  const sha256 = createHash("sha256").update(req.file.buffer).digest("hex");
  const ext = req.file.originalname.includes(".") ? req.file.originalname.split(".").pop() : "jpg";
  const storagePath = `${req.userId}/${randomUUID()}.${ext}`;

  const supabase = req.supabaseUser!;
  const { error: upErr } = await supabase.storage.from("product-primary-2d").upload(storagePath, req.file.buffer, {
    contentType: req.file.mimetype || "image/jpeg",
    upsert: false,
  });
  if (upErr) {
    res.status(500).json({ error: upErr.message });
    return;
  }

  const { data: product, error: pErr } = await supabase
    .from("products")
    .insert({
      seller_id: req.userId!,
      name,
      category,
      description,
      status,
      primary_image_storage_path: storagePath,
      primary_image_sha256: sha256,
    })
    .select("*")
    .single();

  if (pErr || !product) {
    res.status(400).json({ error: pErr?.message ?? "Could not create product." });
    return;
  }

  const { error: tErr } = await supabase.from("product_customization_templates").insert({
    product_id: product.id,
    schema_json: parsedTemplate,
  });

  if (tErr) {
    res.status(201).json({
      product,
      templateWarning: tErr.message,
    });
    return;
  }

  res.status(201).json({ product });
});

sellerRouter.patch("/products/:productId", async (req, res) => {
  const supabase = req.supabaseUser!;
  const productId = req.params.productId;
  const patch: Record<string, unknown> = {};

  if (typeof req.body?.name === "string") patch.name = req.body.name.trim();
  if (typeof req.body?.description === "string") patch.description = req.body.description.trim();
  if (req.body?.status === "published" || req.body?.status === "draft") patch.status = req.body.status;
  if (req.body?.category === "marble" || req.body?.category === "limestone" || req.body?.category === "pebbles") {
    patch.category = req.body.category;
  }

  if (Object.keys(patch).length === 0) {
    res.status(400).json({ error: "No valid fields to update." });
    return;
  }

  const { data, error } = await supabase
    .from("products")
    .update(patch)
    .eq("id", productId)
    .eq("seller_id", req.userId!)
    .select("*")
    .maybeSingle();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  if (!data) {
    res.status(404).json({ error: "Product not found." });
    return;
  }

  res.status(200).json({ product: data });
});

sellerRouter.put("/products/:productId/template", async (req, res) => {
  const supabase = req.supabaseUser!;
  const productId = req.params.productId;
  const schemaJson = req.body?.schema_json;

  try {
    parseTemplateSchema(schemaJson);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid schema_json.";
    res.status(400).json({ error: msg });
    return;
  }

  const { data: product } = await supabase.from("products").select("id").eq("id", productId).eq("seller_id", req.userId!).maybeSingle();
  if (!product) {
    res.status(404).json({ error: "Product not found." });
    return;
  }

  const { data, error } = await supabase
    .from("product_customization_templates")
    .upsert({ product_id: productId, schema_json: schemaJson }, { onConflict: "product_id" })
    .select("*")
    .single();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  res.status(200).json({ template: data });
});
