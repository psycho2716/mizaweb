import { db, defaultSeedUsers } from "../../lib/store";
import type {
  CartItem,
  CustomizationOption,
  CustomizationRule,
  OrderRecord,
  ProductMedia,
  ProductRecord,
  VerificationStatus,
  VerificationSubmission,
} from "../../types/domain";
import { createSupabaseAdminClient, isSupabaseConfigured } from "./client";

interface AppUserRow {
  id: string;
  email: string;
  role: "buyer" | "seller" | "admin";
}

interface SellerStatusRow {
  seller_id: string;
  status: VerificationStatus;
}

interface VerificationRow {
  id: string;
  seller_id: string;
  permit_file_url: string;
  status: "pending" | "approved" | "rejected";
  note: string | null;
  rejection_reason: string | null;
}

interface ProductRow {
  id: string;
  seller_id: string;
  title: string;
  description: string;
  base_price: number;
  is_published: boolean;
}

interface ProductMediaRow {
  id: string;
  product_id: string;
  url: string;
}

interface CustomizationOptionRow {
  id: string;
  product_id: string;
  name: string;
  values: string[];
}

interface CustomizationRuleRow {
  id: string;
  product_id: string;
  label: string;
  amount: number;
}

interface CartItemRow {
  id: string;
  buyer_id: string;
  product_id: string;
  quantity: number;
}

interface OrderRow {
  id: string;
  buyer_id: string;
  status: "created" | "confirmed" | "processing" | "shipped" | "delivered";
  created_at: string;
}

const SYNC_TTL_MS = 1000;
let lastSyncAt = 0;
let syncInFlight: Promise<void> | null = null;

async function refreshRuntimeStateFromSupabase(): Promise<void> {
  if (!isSupabaseConfigured()) {
    return;
  }
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return;
  }

  await supabase.from("app_users").upsert(defaultSeedUsers, { onConflict: "id" });
  await supabase
    .from("app_seller_status")
    .upsert([{ seller_id: "u-seller-1", status: "unsubmitted" }], {
      onConflict: "seller_id",
    });

  const [
    usersRes,
    statusRes,
    verificationRes,
    productRes,
    mediaRes,
    optionRes,
    ruleRes,
    cartRes,
    orderRes,
  ] = await Promise.all([
    supabase.from("app_users").select("*"),
    supabase.from("app_seller_status").select("*"),
    supabase.from("app_verifications").select("*"),
    supabase.from("app_products").select("*"),
    supabase.from("app_product_media").select("*"),
    supabase.from("app_customization_options").select("*"),
    supabase.from("app_customization_rules").select("*"),
    supabase.from("app_cart_items").select("*"),
    supabase.from("app_orders").select("*"),
  ]);

  if (usersRes.data) {
    db.users.clear();
    for (const row of usersRes.data as AppUserRow[]) {
      db.users.set(row.id, { id: row.id, email: row.email, role: row.role });
    }
  }

  if (statusRes.data) {
    db.sellerStatus.clear();
    for (const row of statusRes.data as SellerStatusRow[]) {
      db.sellerStatus.set(row.seller_id, row.status);
    }
  }

  if (verificationRes.data) {
    db.verifications.clear();
    for (const row of verificationRes.data as VerificationRow[]) {
      const value: VerificationSubmission = {
        id: row.id,
        sellerId: row.seller_id,
        permitFileUrl: row.permit_file_url,
        status: row.status,
        ...(row.note ? { note: row.note } : {}),
        ...(row.rejection_reason ? { rejectionReason: row.rejection_reason } : {}),
      };
      db.verifications.set(row.id, value);
    }
  }

  if (productRes.data) {
    db.products.clear();
    for (const row of productRes.data as ProductRow[]) {
      db.products.set(row.id, {
        id: row.id,
        sellerId: row.seller_id,
        title: row.title,
        description: row.description,
        basePrice: Number(row.base_price),
        isPublished: row.is_published,
      });
    }
  }

  if (mediaRes.data) {
    db.productMedia.clear();
    for (const row of mediaRes.data as ProductMediaRow[]) {
      db.productMedia.set(row.id, { id: row.id, productId: row.product_id, url: row.url });
    }
  }

  if (optionRes.data) {
    db.customizationOptions.clear();
    for (const row of optionRes.data as CustomizationOptionRow[]) {
      db.customizationOptions.set(row.id, {
        id: row.id,
        productId: row.product_id,
        name: row.name,
        values: row.values,
      });
    }
  }

  if (ruleRes.data) {
    db.customizationRules.clear();
    for (const row of ruleRes.data as CustomizationRuleRow[]) {
      db.customizationRules.set(row.id, {
        id: row.id,
        productId: row.product_id,
        label: row.label,
        amount: Number(row.amount),
      });
    }
  }

  if (cartRes.data) {
    db.cartItems.clear();
    for (const row of cartRes.data as CartItemRow[]) {
      db.cartItems.set(row.id, {
        id: row.id,
        buyerId: row.buyer_id,
        productId: row.product_id,
        quantity: row.quantity,
      });
    }
  }

  if (orderRes.data) {
    db.orders.clear();
    for (const row of orderRes.data as OrderRow[]) {
      db.orders.set(row.id, {
        id: row.id,
        buyerId: row.buyer_id,
        status: row.status,
        createdAt: row.created_at,
      });
    }
  }

  lastSyncAt = Date.now();
}

export async function syncFromSupabaseIfStale(): Promise<void> {
  if (!isSupabaseConfigured()) {
    return;
  }

  if (Date.now() - lastSyncAt < SYNC_TTL_MS) {
    return;
  }

  if (syncInFlight) {
    await syncInFlight;
    return;
  }

  syncInFlight = refreshRuntimeStateFromSupabase().finally(() => {
    syncInFlight = null;
  });

  await syncInFlight;
}

export async function initializePersistence(): Promise<void> {
  if (!isSupabaseConfigured()) {
    return;
  }
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return;
  }

  await supabase.from("app_users").upsert(defaultSeedUsers, { onConflict: "id" });
  await supabase
    .from("app_seller_status")
    .upsert([{ seller_id: "u-seller-1", status: "unsubmitted" }], {
      onConflict: "seller_id",
    });

  await syncFromSupabaseIfStale();
}

export function persistUser(user: AppUserRow): void {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return;
  void supabase.from("app_users").upsert(user, { onConflict: "id" });
}

export function persistSellerStatus(sellerId: string, status: VerificationStatus): void {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return;
  void supabase
    .from("app_seller_status")
    .upsert({ seller_id: sellerId, status }, { onConflict: "seller_id" });
}

export function persistVerification(row: VerificationSubmission): void {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return;
  void supabase.from("app_verifications").upsert(
    {
      id: row.id,
      seller_id: row.sellerId,
      permit_file_url: row.permitFileUrl,
      status: row.status,
      note: row.note ?? null,
      rejection_reason: row.rejectionReason ?? null,
    },
    { onConflict: "id" },
  );
}

export function persistProduct(row: ProductRecord): void {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return;
  void supabase.from("app_products").upsert(
    {
      id: row.id,
      seller_id: row.sellerId,
      title: row.title,
      description: row.description,
      base_price: row.basePrice,
      is_published: row.isPublished,
    },
    { onConflict: "id" },
  );
}

export function persistProductMedia(row: ProductMedia): void {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return;
  void supabase
    .from("app_product_media")
    .upsert({ id: row.id, product_id: row.productId, url: row.url }, { onConflict: "id" });
}

export function deleteProductMedia(mediaId: string): void {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return;
  void supabase.from("app_product_media").delete().eq("id", mediaId);
}

export function persistCustomizationOption(row: CustomizationOption): void {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return;
  void supabase.from("app_customization_options").upsert(
    { id: row.id, product_id: row.productId, name: row.name, values: row.values },
    { onConflict: "id" },
  );
}

export function persistCustomizationRule(row: CustomizationRule): void {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return;
  void supabase.from("app_customization_rules").upsert(
    { id: row.id, product_id: row.productId, label: row.label, amount: row.amount },
    { onConflict: "id" },
  );
}

export function persistCartItem(row: CartItem): void {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return;
  void supabase.from("app_cart_items").upsert(
    {
      id: row.id,
      buyer_id: row.buyerId,
      product_id: row.productId,
      quantity: row.quantity,
    },
    { onConflict: "id" },
  );
}

export function deleteCartItem(cartItemId: string): void {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return;
  void supabase.from("app_cart_items").delete().eq("id", cartItemId);
}

export function persistOrder(row: OrderRecord): void {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return;
  void supabase.from("app_orders").upsert(
    {
      id: row.id,
      buyer_id: row.buyerId,
      status: row.status,
      created_at: row.createdAt,
    },
    { onConflict: "id" },
  );
}
