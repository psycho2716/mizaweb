import type { User as SupabaseAuthUser } from "@supabase/supabase-js";
import { db } from "../../lib/store";
import type {
    AuthUser,
    CartItem,
    CustomizationOption,
    CustomizationRule,
    OrderRecord,
    OrderMessage,
    ProductMedia,
    ProductRecord,
    SellerProfile,
    SellerPaymentMethod,
    UserRole,
    VerificationStatus,
    VerificationSubmission
} from "../../types/domain";
import { createSupabaseAdminClient, isSupabaseConfigured } from "./client";

function mapSupabaseAuthRecordToAuthUser(u: SupabaseAuthUser): AuthUser | null {
    const role = u.user_metadata?.role;
    if (role !== "buyer" && role !== "seller" && role !== "admin") {
        return null;
    }
    return {
        id: u.id,
        email: u.email ?? "",
        role: role as UserRole,
        ...(u.user_metadata?.full_name
            ? { fullName: String(u.user_metadata.full_name) }
            : {})
    };
}

/** Merge a single Auth user into the runtime map (e.g. after JWT validation before full sync). */
export function applyAuthUserToRuntime(u: SupabaseAuthUser): void {
    const mapped = mapSupabaseAuthRecordToAuthUser(u);
    if (mapped) {
        db.users.set(mapped.id, mapped);
    }
}

async function loadAuthUsersIntoRuntime(
    supabase: NonNullable<ReturnType<typeof createSupabaseAdminClient>>
): Promise<void> {
    db.users.clear();
    let page = 1;
    const perPage = 1000;
    for (;;) {
        const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
        if (error) {
            console.error("[loadAuthUsersIntoRuntime]", error.message);
            return;
        }
        if (!data?.users?.length) {
            break;
        }
        for (const u of data.users) {
            const mapped = mapSupabaseAuthRecordToAuthUser(u);
            if (mapped) {
                db.users.set(mapped.id, mapped);
            }
        }
        if (data.users.length < perPage) {
            break;
        }
        page += 1;
    }
}

interface SellerStatusRow {
    seller_id: string;
    status: VerificationStatus;
}

interface SellerProfileRow {
    seller_id: string;
    business_name: string;
    contact_number: string;
    address: string;
    profile_image_url: string | null;
    store_background_url: string | null;
}

interface SellerPaymentMethodRow {
    id: string;
    seller_id: string;
    method_name: string;
    account_name: string;
    account_number: string;
    qr_image_url: string | null;
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
    model_3d_url: string | null;
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
    buyer_id: string | null;
    guest_session_id: string | null;
    product_id: string;
    quantity: number;
}

interface OrderRow {
    id: string;
    buyer_id: string;
    seller_id: string;
    status: "created" | "confirmed" | "processing" | "shipped" | "delivered";
    payment_method: "cash" | "online";
    payment_reference: string | null;
    payment_status: "pending" | "paid";
    receipt_status: "none" | "submitted" | "resubmit_requested" | "approved";
    receipt_request_note: string | null;
    total_amount: number;
    created_at: string;
}

interface OrderMessageRow {
    id: string;
    order_id: string;
    sender_id: string;
    body: string;
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

    const [
        statusRes,
        verificationRes,
        sellerProfileRes,
        sellerPaymentMethodRes,
        productRes,
        mediaRes,
        optionRes,
        ruleRes,
        cartRes,
        orderRes,
        messageRes
    ] = await Promise.all([
        supabase.from("app_seller_status").select("*"),
        supabase.from("app_verifications").select("*"),
        supabase.from("app_seller_profiles").select("*"),
        supabase.from("app_seller_payment_methods").select("*"),
        supabase.from("app_products").select("*"),
        supabase.from("app_product_media").select("*"),
        supabase.from("app_customization_options").select("*"),
        supabase.from("app_customization_rules").select("*"),
        supabase.from("app_cart_items").select("*"),
        supabase.from("app_orders").select("*"),
        supabase.from("app_order_messages").select("*")
    ]);

    await loadAuthUsersIntoRuntime(supabase);

    if (statusRes.data) {
        db.sellerStatus.clear();
        for (const row of statusRes.data as SellerStatusRow[]) {
            db.sellerStatus.set(row.seller_id, row.status);
        }
    }

    if (sellerProfileRes.data) {
        db.sellerProfiles.clear();
        for (const row of sellerProfileRes.data as SellerProfileRow[]) {
            const profile: SellerProfile = {
                sellerId: row.seller_id,
                businessName: row.business_name,
                contactNumber: row.contact_number,
                address: row.address,
                ...(row.profile_image_url ? { profileImageUrl: row.profile_image_url } : {}),
                ...(row.store_background_url
                    ? { storeBackgroundUrl: row.store_background_url }
                    : {})
            };
            db.sellerProfiles.set(row.seller_id, profile);
        }
    }

    if (sellerPaymentMethodRes.data) {
        db.sellerPaymentMethods.clear();
        for (const row of sellerPaymentMethodRes.data as SellerPaymentMethodRow[]) {
            db.sellerPaymentMethods.set(row.id, {
                id: row.id,
                sellerId: row.seller_id,
                methodName: row.method_name,
                accountName: row.account_name,
                accountNumber: row.account_number,
                ...(row.qr_image_url ? { qrImageUrl: row.qr_image_url } : {})
            });
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
                ...(row.rejection_reason ? { rejectionReason: row.rejection_reason } : {})
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
                ...(row.model_3d_url ? { model3dUrl: row.model_3d_url } : {})
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
                values: row.values
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
                amount: Number(row.amount)
            });
        }
    }

    if (cartRes.data) {
        db.cartItems.clear();
        for (const row of cartRes.data as CartItemRow[]) {
            db.cartItems.set(row.id, {
                id: row.id,
                ...(row.buyer_id ? { buyerId: row.buyer_id } : {}),
                ...(row.guest_session_id ? { guestSessionId: row.guest_session_id } : {}),
                productId: row.product_id,
                quantity: row.quantity
            });
        }
    }

    if (orderRes.data) {
        db.orders.clear();
        for (const row of orderRes.data as OrderRow[]) {
            db.orders.set(row.id, {
                id: row.id,
                buyerId: row.buyer_id,
                sellerId: row.seller_id,
                status: row.status,
                paymentMethod: row.payment_method,
                ...(row.payment_reference ? { paymentReference: row.payment_reference } : {}),
                paymentStatus: row.payment_status,
                receiptStatus: row.receipt_status,
                ...(row.receipt_request_note
                    ? { receiptRequestNote: row.receipt_request_note }
                    : {}),
                totalAmount: Number(row.total_amount),
                createdAt: row.created_at
            });
        }
    }

    if (messageRes.data) {
        db.orderMessages.clear();
        for (const row of messageRes.data as OrderMessageRow[]) {
            const message: OrderMessage = {
                id: row.id,
                orderId: row.order_id,
                senderId: row.sender_id,
                body: row.body,
                createdAt: row.created_at
            };
            db.orderMessages.set(row.id, message);
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
    await syncFromSupabaseIfStale();
}

export async function persistSellerStatus(
    sellerId: string,
    status: VerificationStatus
): Promise<void> {
    const supabase = createSupabaseAdminClient();
    if (!supabase) return;
    const { error } = await supabase
        .from("app_seller_status")
        .upsert({ seller_id: sellerId, status }, { onConflict: "seller_id" });
    if (error) {
        console.error("[persistSellerStatus]", error.message);
        throw new Error(`Failed to persist seller status: ${error.message}`);
    }
}

export async function persistSellerProfile(profile: SellerProfile): Promise<void> {
    const supabase = createSupabaseAdminClient();
    if (!supabase) return;
    const { error } = await supabase.from("app_seller_profiles").upsert(
        {
            seller_id: profile.sellerId,
            business_name: profile.businessName,
            contact_number: profile.contactNumber,
            address: profile.address,
            profile_image_url: profile.profileImageUrl ?? null,
            store_background_url: profile.storeBackgroundUrl ?? null
        },
        { onConflict: "seller_id" }
    );
    if (error) {
        console.error("[persistSellerProfile]", error.message);
        throw new Error(`Failed to persist seller profile: ${error.message}`);
    }
}

export function persistSellerPaymentMethod(row: SellerPaymentMethod): void {
    const supabase = createSupabaseAdminClient();
    if (!supabase) return;
    void supabase.from("app_seller_payment_methods").upsert(
        {
            id: row.id,
            seller_id: row.sellerId,
            method_name: row.methodName,
            account_name: row.accountName,
            account_number: row.accountNumber,
            qr_image_url: row.qrImageUrl ?? null
        },
        { onConflict: "id" }
    );
}

export function deleteSellerPaymentMethod(id: string): void {
    const supabase = createSupabaseAdminClient();
    if (!supabase) return;
    void supabase.from("app_seller_payment_methods").delete().eq("id", id);
}

export async function persistVerification(row: VerificationSubmission): Promise<void> {
    const supabase = createSupabaseAdminClient();
    if (!supabase) return;
    const { error } = await supabase.from("app_verifications").upsert(
        {
            id: row.id,
            seller_id: row.sellerId,
            permit_file_url: row.permitFileUrl,
            status: row.status,
            note: row.note ?? null,
            rejection_reason: row.rejectionReason ?? null
        },
        { onConflict: "id" }
    );
    if (error) {
        console.error("[persistVerification]", error.message);
        throw new Error(`Failed to persist verification: ${error.message}`);
    }
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
            model_3d_url: row.model3dUrl ?? null
        },
        { onConflict: "id" }
    );
}

export function deleteProduct(productId: string): void {
    const supabase = createSupabaseAdminClient();
    if (!supabase) return;
    void supabase.from("app_products").delete().eq("id", productId);
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
    void supabase
        .from("app_customization_options")
        .upsert(
            { id: row.id, product_id: row.productId, name: row.name, values: row.values },
            { onConflict: "id" }
        );
}

export function persistCustomizationRule(row: CustomizationRule): void {
    const supabase = createSupabaseAdminClient();
    if (!supabase) return;
    void supabase
        .from("app_customization_rules")
        .upsert(
            { id: row.id, product_id: row.productId, label: row.label, amount: row.amount },
            { onConflict: "id" }
        );
}

export function deleteCustomizationOptionsByProduct(productId: string): void {
    const supabase = createSupabaseAdminClient();
    if (!supabase) return;
    void supabase.from("app_customization_options").delete().eq("product_id", productId);
}

export function deleteCustomizationRulesByProduct(productId: string): void {
    const supabase = createSupabaseAdminClient();
    if (!supabase) return;
    void supabase.from("app_customization_rules").delete().eq("product_id", productId);
}

export function deleteProductMediaByProduct(productId: string): void {
    const supabase = createSupabaseAdminClient();
    if (!supabase) return;
    void supabase.from("app_product_media").delete().eq("product_id", productId);
}

export function persistCartItem(row: CartItem): void {
    const supabase = createSupabaseAdminClient();
    if (!supabase) return;
    void supabase.from("app_cart_items").upsert(
        {
            id: row.id,
            buyer_id: row.buyerId ?? null,
            guest_session_id: row.guestSessionId ?? null,
            product_id: row.productId,
            quantity: row.quantity
        },
        { onConflict: "id" }
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
            seller_id: row.sellerId,
            status: row.status,
            payment_method: row.paymentMethod,
            payment_reference: row.paymentReference ?? null,
            payment_status: row.paymentStatus,
            receipt_status: row.receiptStatus,
            receipt_request_note: row.receiptRequestNote ?? null,
            total_amount: row.totalAmount,
            created_at: row.createdAt
        },
        { onConflict: "id" }
    );
}

export function persistOrderMessage(row: OrderMessage): void {
    const supabase = createSupabaseAdminClient();
    if (!supabase) return;
    void supabase.from("app_order_messages").upsert(
        {
            id: row.id,
            order_id: row.orderId,
            sender_id: row.senderId,
            body: row.body,
            created_at: row.createdAt
        },
        { onConflict: "id" }
    );
}
