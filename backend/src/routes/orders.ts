import { Router } from "express";

import { loadProfileRole, requireBearerUser, requireRole } from "../middleware/bearerAuth";
import { createAdminSupabaseClient } from "../lib/supabase";
import { rateLimitKey } from "../lib/rateLimit";

export const ordersRouter = Router();

ordersRouter.post("/", requireBearerUser, loadProfileRole, requireRole("customer"), async (req, res) => {
  if (!rateLimitKey(`orders:${req.userId!}`, 30, 60 * 60 * 1000)) {
    res.status(429).json({ error: "Too many orders. Try again later." });
    return;
  }

  const customizationId = typeof req.body?.customization_id === "string" ? req.body.customization_id : "";
  const deliveryMethod = req.body?.delivery_method === "pickup" ? "pickup" : req.body?.delivery_method === "delivery" ? "delivery" : "";
  const totalAmount = typeof req.body?.total_amount === "number" ? req.body.total_amount : Number(req.body?.total_amount);
  const deliveryAddressLine1 = typeof req.body?.delivery_address_line1 === "string" ? req.body.delivery_address_line1 : null;
  const deliveryCity = typeof req.body?.delivery_city === "string" ? req.body.delivery_city : null;
  const deliveryNotes = typeof req.body?.delivery_notes === "string" ? req.body.delivery_notes : null;

  if (!customizationId || !deliveryMethod) {
    res.status(400).json({ error: "customization_id and delivery_method are required." });
    return;
  }

  if (deliveryMethod === "delivery" && (!deliveryAddressLine1 || !deliveryCity)) {
    res.status(400).json({ error: "Delivery address and city are required for delivery." });
    return;
  }

  if (Number.isNaN(totalAmount) || totalAmount < 0) {
    res.status(400).json({ error: "total_amount must be a non-negative number." });
    return;
  }

  const supabase = req.supabaseUser!;
  const { data: cust, error: cErr } = await supabase
    .from("customizations")
    .select("id,customer_id,seller_id,product_id,status")
    .eq("id", customizationId)
    .maybeSingle();

  if (cErr || !cust || cust.customer_id !== req.userId) {
    res.status(404).json({ error: "Customization not found." });
    return;
  }

  if (cust.status === "ordered") {
    res.status(400).json({ error: "This customization was already ordered." });
    return;
  }

  const admin = createAdminSupabaseClient();
  const { data: order, error: oErr } = await admin
    .from("orders")
    .insert({
      customer_id: req.userId!,
      customization_id: customizationId,
      seller_id: cust.seller_id,
      total_amount: totalAmount,
      delivery_method: deliveryMethod,
      delivery_address_line1: deliveryAddressLine1,
      delivery_city: deliveryCity,
      delivery_notes: deliveryNotes,
      order_status: "pending",
    })
    .select("*")
    .single();

  if (oErr || !order) {
    res.status(400).json({ error: oErr?.message ?? "Could not create order." });
    return;
  }

  await admin.from("customizations").update({ status: "ordered" }).eq("id", customizationId);

  res.status(201).json({ order });
});
