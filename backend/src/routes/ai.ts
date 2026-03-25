import { createHash } from "crypto";
import { Router } from "express";

import { env } from "../lib/env";
import { rateLimitKey } from "../lib/rateLimit";
import { emitAiJobEvent } from "../lib/socketBus";
import { createAdminSupabaseClient } from "../lib/supabase";
import { loadProfileRole, requireBearerUser, requireRole } from "../middleware/bearerAuth";

export const aiRouter = Router();

aiRouter.use(requireBearerUser, loadProfileRole, requireRole("customer", "seller", "admin"));

function cacheKeyParts(productSha: string, customizationFingerprint: string): string {
  return `${productSha}:${customizationFingerprint}`;
}

async function processJob(jobId: string, userId: string, productId: string, inputSha: string, cacheKey: string) {
  const admin = createAdminSupabaseClient();

  const emit = (patch: Record<string, unknown>) => {
    emitAiJobEvent(jobId, { jobId, ...patch });
  };

  await admin.from("ai_2d_to_3d_jobs").update({ status: "processing" }).eq("id", jobId);
  emit({ status: "processing" });

  const { data: cached } = await admin.from("ai_2d_to_3d_cache").select("output_storage_path").eq("cache_key", cacheKey).maybeSingle();
  if (cached?.output_storage_path) {
    await admin
      .from("ai_2d_to_3d_jobs")
      .update({
        status: "completed",
        output_storage_path: cached.output_storage_path,
        cache_hit: true,
        error_message: null,
      })
      .eq("id", jobId);
    emit({ status: "completed", output_storage_path: cached.output_storage_path, cache_hit: true });
    return;
  }

  const falUrl = env.FAL_2D_TO_3D_URL?.trim();
  const falKey = env.FAL_API_KEY?.trim();

  if (!falUrl || !falKey) {
    await admin
      .from("ai_2d_to_3d_jobs")
      .update({
        status: "failed",
        error_message: "AI mesh generation is not configured (set FAL_2D_TO_3D_URL and FAL_API_KEY).",
      })
      .eq("id", jobId);
    emit({ status: "failed", error_message: "AI not configured." });
    return;
  }

  try {
    const resp = await fetch(falUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Key ${falKey}`,
      },
      body: JSON.stringify({
        product_id: productId,
        input_image_sha256: inputSha,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Fal HTTP ${resp.status}: ${text.slice(0, 500)}`);
    }

    const json = (await resp.json()) as { model_url?: string; glb_url?: string };
    const modelUrl = json.model_url ?? json.glb_url;
    if (!modelUrl || typeof modelUrl !== "string") {
      throw new Error("Fal response missing model_url/glb_url.");
    }

    const glbResp = await fetch(modelUrl);
    if (!glbResp.ok) {
      throw new Error(`Failed to download GLB (${glbResp.status}).`);
    }
    const buf = Buffer.from(await glbResp.arrayBuffer());
    const path = `${userId}/${jobId}.glb`;

    const { error: upErr } = await admin.storage.from("ai-2d-to-3d-models").upload(path, buf, {
      contentType: "model/gltf-binary",
      upsert: true,
    });
    if (upErr) {
      throw new Error(upErr.message);
    }

    await admin.from("ai_2d_to_3d_cache").upsert(
      {
        cache_key: cacheKey,
        output_storage_path: path,
      },
      { onConflict: "cache_key" }
    );

    await admin
      .from("ai_2d_to_3d_jobs")
      .update({
        status: "completed",
        output_storage_path: path,
        cache_hit: false,
        error_message: null,
      })
      .eq("id", jobId);

    emit({ status: "completed", output_storage_path: path, cache_hit: false });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    await admin.from("ai_2d_to_3d_jobs").update({ status: "failed", error_message: message }).eq("id", jobId);
    emit({ status: "failed", error_message: message });
  }
}

aiRouter.post("/jobs", async (req, res) => {
  if (!rateLimitKey(`ai:${req.userId!}`, 40, 60 * 60 * 1000)) {
    res.status(429).json({ error: "Too many AI jobs. Try again later." });
    return;
  }

  const supabase = req.supabaseUser!;
  const productId = typeof req.body?.product_id === "string" ? req.body.product_id : "";
  const customizationId =
    typeof req.body?.customization_id === "string" && req.body.customization_id.length > 0 ? req.body.customization_id : null;

  if (!productId) {
    res.status(400).json({ error: "product_id is required." });
    return;
  }

  const { data: product, error: pErr } = await supabase
    .from("products")
    .select("id,primary_image_sha256,status,seller_id")
    .eq("id", productId)
    .maybeSingle();

  if (pErr || !product) {
    res.status(404).json({ error: "Product not found." });
    return;
  }

  const isOwnerSeller = product.seller_id === req.userId;
  const { data: pub } = await supabase
    .from("products")
    .select("id")
    .eq("id", productId)
    .eq("status", "published")
    .maybeSingle();

  if (!isOwnerSeller && !pub) {
    res.status(403).json({ error: "Product is not visible for AI generation." });
    return;
  }

  let customizationFingerprint = "none";
  if (customizationId) {
    const { data: cust, error: cErr } = await supabase
      .from("customizations")
      .select("id,product_id,customer_id,snapshot_json")
      .eq("id", customizationId)
      .maybeSingle();
    if (cErr || !cust || cust.product_id !== productId) {
      res.status(400).json({ error: "Invalid customization." });
      return;
    }
    if (cust.customer_id !== req.userId) {
      res.status(403).json({ error: "Customization does not belong to the current user." });
      return;
    }
    customizationFingerprint = createHash("sha256").update(JSON.stringify(cust.snapshot_json)).digest("hex");
  }

  const cacheKey = cacheKeyParts(product.primary_image_sha256, customizationFingerprint);

  const { data: job, error: jErr } = await supabase
    .from("ai_2d_to_3d_jobs")
    .insert({
      user_id: req.userId!,
      product_id: productId,
      customization_id: customizationId,
      status: "queued",
      input_image_sha256: product.primary_image_sha256,
    })
    .select("id,status,created_at")
    .single();

  if (jErr || !job) {
    res.status(400).json({ error: jErr?.message ?? "Could not create job." });
    return;
  }

  res.status(202).json({ job });

  setImmediate(() => {
    void processJob(job.id, req.userId!, productId, product.primary_image_sha256, cacheKey);
  });
});

aiRouter.get("/jobs/:id", async (req, res) => {
  const supabase = req.supabaseUser!;
  const { data, error } = await supabase.from("ai_2d_to_3d_jobs").select("*").eq("id", req.params.id).maybeSingle();
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  if (!data || data.user_id !== req.userId) {
    res.status(404).json({ error: "Job not found." });
    return;
  }
  res.status(200).json({ job: data });
});

aiRouter.get("/jobs/:id/model-signed-url", async (req, res) => {
  const supabase = req.supabaseUser!;
  const { data: job, error } = await supabase.from("ai_2d_to_3d_jobs").select("user_id,status,output_storage_path").eq("id", req.params.id).maybeSingle();
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  if (!job || job.user_id !== req.userId) {
    res.status(404).json({ error: "Job not found." });
    return;
  }
  if (job.status !== "completed" || !job.output_storage_path) {
    res.status(400).json({ error: "Model is not ready." });
    return;
  }

  const admin = createAdminSupabaseClient();
  const { data: signed, error: sErr } = await admin.storage
    .from("ai-2d-to-3d-models")
    .createSignedUrl(job.output_storage_path, 60 * 30);

  if (sErr || !signed?.signedUrl) {
    res.status(500).json({ error: sErr?.message ?? "Could not sign URL." });
    return;
  }

  res.status(200).json({ url: signed.signedUrl });
});
