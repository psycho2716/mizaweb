import { Router } from "express";

import { loadProfileRole, requireBearerUser, requireRole } from "../middleware/bearerAuth";

export const adminRouter = Router();

adminRouter.use(requireBearerUser, loadProfileRole, requireRole("admin"));

adminRouter.get("/seller-verifications", async (req, res) => {
  const supabase = req.supabaseUser!;
  const status = typeof req.query.status === "string" ? req.query.status : "pending";

  let q = supabase.from("seller_verifications").select("*").order("created_at", { ascending: false });
  if (status === "pending" || status === "approved" || status === "rejected") {
    q = q.eq("status", status);
  }

  const { data, error } = await q;
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.status(200).json({ verifications: data ?? [] });
});

adminRouter.post("/sellers/:sellerId/verify", async (req, res) => {
  const sellerId = req.params.sellerId;
  const nextStatus = req.body?.status === "approved" ? "approved" : req.body?.status === "rejected" ? "rejected" : "";
  const adminNotes = typeof req.body?.admin_notes === "string" ? req.body.admin_notes : null;

  if (!nextStatus) {
    res.status(400).json({ error: 'status must be "approved" or "rejected".' });
    return;
  }

  const supabase = req.supabaseUser!;
  const { data, error } = await supabase
    .from("seller_verifications")
    .update({
      status: nextStatus,
      admin_notes: adminNotes,
      reviewed_by_admin_id: req.userId!,
      reviewed_at: new Date().toISOString(),
    })
    .eq("seller_id", sellerId)
    .select("*")
    .maybeSingle();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  if (!data) {
    res.status(404).json({ error: "Verification record not found." });
    return;
  }

  res.status(200).json({ verification: data });
});
