import type { User as SupabaseAuthUser } from "@supabase/supabase-js";
import { db } from "../../lib/store";
import type {
    AuthUser,
    CartItem,
    CartItemSelection,
    ConversationMessageRecord,
    ConversationRecord,
    CustomizationOption,
    CustomizationRule,
    OrderLineItemRecord,
    OrderQualityChecklist,
    OrderQualityChecklistItem,
    OrderRecord,
    OrderMessage,
    ProductMedia,
    ProductRecord,
    ProductReviewRecord,
    SellerLocationChangeRequest,
    SellerProfile,
    SellerPaymentMethod,
    UserRole,
    VerificationStatus,
    VerificationSubmission
} from "../../types/domain";
import { createSupabaseAdminClient, isSupabaseConfigured } from "./client";

const LEGACY_QC_DEFAULTS: { id: string; label: string; legacyKey: string }[] = [
    {
        id: "miza-qc-default-listing",
        label: "Item matches listing photos and description",
        legacyKey: "itemMatchesListing"
    },
    {
        id: "miza-qc-default-packing",
        label: "Packing protects edges and corners",
        legacyKey: "packingProtectsEdges"
    },
    {
        id: "miza-qc-default-order-id",
        label: "Label or note includes order ID",
        legacyKey: "labelIncludesOrderId"
    }
];

function parseStoredQualityChecklist(raw: unknown): OrderQualityChecklist | undefined {
    if (!raw || typeof raw !== "object") {
        return undefined;
    }
    const r = raw as Record<string, unknown>;

    if (Array.isArray(r.items)) {
        const items: OrderQualityChecklistItem[] = [];
        for (const x of r.items) {
            if (!x || typeof x !== "object") {
                continue;
            }
            const o = x as Record<string, unknown>;
            if (
                typeof o.id !== "string" ||
                typeof o.label !== "string" ||
                typeof o.checked !== "boolean"
            ) {
                continue;
            }
            const id = o.id.trim();
            const label = o.label.trim();
            if (!id || id.length > 120 || !label || label.length > 500) {
                continue;
            }
            items.push({ id, label, checked: o.checked });
        }
        if (items.length === 0) {
            return undefined;
        }
        return { items };
    }

    if (
        typeof r.itemMatchesListing === "boolean" &&
        typeof r.packingProtectsEdges === "boolean" &&
        typeof r.labelIncludesOrderId === "boolean"
    ) {
        return {
            items: LEGACY_QC_DEFAULTS.map((d) => ({
                id: d.id,
                label: d.label,
                checked: Boolean(r[d.legacyKey])
            }))
        };
    }

    return undefined;
}

function parseStoredSelections(raw: unknown): CartItemSelection[] {
    if (!Array.isArray(raw)) {
        return [];
    }
    const out: CartItemSelection[] = [];
    for (const x of raw) {
        if (!x || typeof x !== "object") {
            continue;
        }
        const r = x as { optionId?: unknown; value?: unknown; optionLabel?: unknown };
        if (typeof r.optionId === "string" && typeof r.value === "string") {
            const row: CartItemSelection = { optionId: r.optionId, value: r.value };
            if (typeof r.optionLabel === "string" && r.optionLabel.trim()) {
                row.optionLabel = r.optionLabel.trim();
            }
            out.push(row);
        }
    }
    return out;
}

function isAuthUserBanned(u: SupabaseAuthUser): boolean {
    const raw = (u as { banned_until?: string | null }).banned_until;
    if (!raw) {
        return false;
    }
    const until = new Date(raw).getTime();
    return Number.isFinite(until) && until > Date.now();
}

function mapSupabaseAuthRecordToAuthUser(u: SupabaseAuthUser): AuthUser | null {
    const role = u.user_metadata?.role;
    if (role !== "buyer" && role !== "seller" && role !== "admin") {
        return null;
    }
    const suspended =
        isAuthUserBanned(u) || u.user_metadata?.suspended === true || u.user_metadata?.suspended === "true";
    const metaPic = u.user_metadata?.profile_image_url ?? u.user_metadata?.avatar_url;
    const cn = u.user_metadata?.contact_number;
    const addr = u.user_metadata?.shipping_address_line;
    const city = u.user_metadata?.shipping_city;
    const zip = u.user_metadata?.shipping_postal_code;
    return {
        id: u.id,
        email: u.email ?? "",
        role: role as UserRole,
        ...(u.user_metadata?.full_name
            ? { fullName: String(u.user_metadata.full_name) }
            : {}),
        ...(metaPic ? { profileImageUrl: String(metaPic) } : {}),
        ...(cn != null && String(cn).trim() !== ""
            ? { contactNumber: String(cn).replace(/\D/g, "") }
            : {}),
        ...(addr != null && String(addr).trim() !== ""
            ? { shippingAddressLine: String(addr).trim() }
            : {}),
        ...(city != null && String(city).trim() !== ""
            ? { shippingCity: String(city).trim() }
            : {}),
        ...(zip != null && String(zip).trim() !== ""
            ? { shippingPostalCode: String(zip).replace(/\D/g, "") }
            : {}),
        ...(suspended ? { suspended: true } : {})
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
    const merged = new Map<string, AuthUser>();
    let page = 1;
    const perPage = 1000;
    try {
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
                    merged.set(mapped.id, mapped);
                }
            }
            if (data.users.length < perPage) {
                break;
            }
            page += 1;
        }
        db.users.clear();
        for (const [, user] of merged) {
            db.users.set(user.id, user);
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(
            "[loadAuthUsersIntoRuntime]",
            message,
            "(is local Supabase running? Try: npm run supabase:start from repo root)"
        );
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
    shop_latitude: number | null;
    shop_longitude: number | null;
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
    permit_object_path?: string | null;
    status: "pending" | "approved" | "rejected";
    note: string | null;
    rejection_reason: string | null;
}

interface SellerLocationRequestRow {
    id: string;
    seller_id: string;
    requested_latitude: number;
    requested_longitude: number;
    previous_latitude: number | null;
    previous_longitude: number | null;
    note: string | null;
    status: "pending" | "approved" | "rejected";
    created_at: string;
    reviewed_at: string | null;
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
    made_to_order?: boolean | null;
    stock_quantity?: number | null;
    is_featured?: boolean | null;
    video_url?: string | null;
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
    selections?: unknown;
}

interface OrderRow {
    id: string;
    buyer_id: string;
    seller_id: string;
    status: "created" | "confirmed" | "processing" | "shipped" | "delivered" | "cancelled";
    payment_method: "cash" | "online";
    payment_reference: string | null;
    payment_status: "pending" | "paid";
    receipt_status: "none" | "submitted" | "resubmit_requested" | "approved";
    receipt_request_note: string | null;
    total_amount: number;
    created_at: string;
    receipt_proof_url?: string | null;
    seller_payment_method_id?: string | null;
    estimated_delivery_start_at?: string | null;
    estimated_delivery_end_at?: string | null;
    estimated_delivery_range_display?: string | null;
    shipping_recipient_name?: string | null;
    shipping_address_line?: string | null;
    shipping_city?: string | null;
    shipping_postal_code?: string | null;
    shipping_contact_number?: string | null;
    delivery_notes?: string | null;
    cancellation_reason?: string | null;
    quality_checklist?: unknown | null;
}

interface OrderMessageRow {
    id: string;
    order_id: string;
    sender_id: string;
    body: string;
    created_at: string;
}

interface OrderLineItemRow {
    id: string;
    order_id: string;
    product_id: string;
    quantity: number;
    created_at: string;
    selections?: unknown;
}

interface ProductReviewRow {
    id: string;
    product_id: string;
    buyer_id: string;
    rating: number;
    body: string;
    created_at: string;
    updated_at: string;
}

interface ConversationRow {
    id: string;
    buyer_id: string;
    seller_id: string;
    updated_at: string;
}

interface ConversationMessageRow {
    id: string;
    conversation_id: string;
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

    try {
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
        orderLineItemsRes,
        messageRes,
        productReviewsRes,
        conversationsRes,
        conversationMessagesRes,
        locationRequestRes
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
        supabase.from("app_order_line_items").select("*"),
        supabase.from("app_order_messages").select("*"),
        supabase.from("app_product_reviews").select("*"),
        supabase.from("app_conversations").select("*"),
        supabase.from("app_conversation_messages").select("*"),
        supabase.from("app_seller_location_requests").select("*")
    ]);

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
                ...(row.shop_latitude != null && row.shop_longitude != null
                    ? { shopLatitude: row.shop_latitude, shopLongitude: row.shop_longitude }
                    : {}),
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
                ...(row.permit_object_path && row.permit_object_path.length > 0
                    ? { permitObjectPath: row.permit_object_path }
                    : {}),
                ...(row.note ? { note: row.note } : {}),
                ...(row.rejection_reason ? { rejectionReason: row.rejection_reason } : {})
            };
            db.verifications.set(row.id, value);
        }
    }

    if (locationRequestRes.data) {
        db.sellerLocationRequests.clear();
        for (const row of locationRequestRes.data as SellerLocationRequestRow[]) {
            const value: SellerLocationChangeRequest = {
                id: row.id,
                sellerId: row.seller_id,
                requestedLatitude: row.requested_latitude,
                requestedLongitude: row.requested_longitude,
                status: row.status,
                createdAt: row.created_at,
                ...(row.previous_latitude != null && row.previous_longitude != null
                    ? { previousLatitude: row.previous_latitude, previousLongitude: row.previous_longitude }
                    : {}),
                ...(row.note ? { note: row.note } : {}),
                ...(row.reviewed_at ? { reviewedAt: row.reviewed_at } : {}),
                ...(row.rejection_reason ? { rejectionReason: row.rejection_reason } : {})
            };
            db.sellerLocationRequests.set(row.id, value);
        }
    }

    if (productRes.data) {
        db.products.clear();
        for (const row of productRes.data as ProductRow[]) {
            const madeToOrder = row.made_to_order === true;
            db.products.set(row.id, {
                id: row.id,
                sellerId: row.seller_id,
                title: row.title,
                description: row.description,
                basePrice: Number(row.base_price),
                isPublished: row.is_published,
                madeToOrder,
                isFeatured: row.is_featured === true,
                ...(row.model_3d_url ? { model3dUrl: row.model_3d_url } : {}),
                ...(!madeToOrder ? { stockQuantity: Number(row.stock_quantity ?? 0) } : {}),
                ...(row.video_url ? { videoUrl: row.video_url } : {})
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
                quantity: row.quantity,
                selections: parseStoredSelections(row.selections)
            });
        }
    }

    if (orderRes.data) {
        db.orders.clear();
        for (const row of orderRes.data as OrderRow[]) {
            const qualityChecklist = parseStoredQualityChecklist(row.quality_checklist);
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
                createdAt: row.created_at,
                ...(row.receipt_proof_url ? { receiptProofUrl: row.receipt_proof_url } : {}),
                ...(row.seller_payment_method_id
                    ? { sellerPaymentMethodId: row.seller_payment_method_id }
                    : {}),
                ...(row.estimated_delivery_start_at
                    ? { estimatedDeliveryStartAt: row.estimated_delivery_start_at }
                    : {}),
                ...(row.estimated_delivery_end_at
                    ? { estimatedDeliveryEndAt: row.estimated_delivery_end_at }
                    : {}),
                ...(row.estimated_delivery_range_display
                    ? { estimatedDeliveryRangeDisplay: row.estimated_delivery_range_display }
                    : {}),
                ...(row.shipping_recipient_name
                    ? { shippingRecipientName: row.shipping_recipient_name }
                    : {}),
                ...(row.shipping_address_line
                    ? { shippingAddressLine: row.shipping_address_line }
                    : {}),
                ...(row.shipping_city ? { shippingCity: row.shipping_city } : {}),
                ...(row.shipping_postal_code
                    ? { shippingPostalCode: row.shipping_postal_code }
                    : {}),
                ...(row.shipping_contact_number
                    ? { shippingContactNumber: row.shipping_contact_number }
                    : {}),
                ...(row.delivery_notes ? { deliveryNotes: row.delivery_notes } : {}),
                ...(row.cancellation_reason
                    ? { cancellationReason: row.cancellation_reason }
                    : {}),
                ...(qualityChecklist ? { qualityChecklist } : {})
            });
        }
    }

    if (orderLineItemsRes.data) {
        db.orderLineItems.clear();
        for (const row of orderLineItemsRes.data as OrderLineItemRow[]) {
            const item: OrderLineItemRecord = {
                id: row.id,
                orderId: row.order_id,
                productId: row.product_id,
                quantity: row.quantity,
                createdAt: row.created_at,
                selections: parseStoredSelections(row.selections)
            };
            db.orderLineItems.set(row.id, item);
        }
    }

    if (messageRes.error) {
        console.error("[refreshRuntimeStateFromSupabase] app_order_messages", messageRes.error.message);
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

    if (productReviewsRes.data) {
        db.productReviews.clear();
        for (const row of productReviewsRes.data as ProductReviewRow[]) {
            const review: ProductReviewRecord = {
                id: row.id,
                productId: row.product_id,
                buyerId: row.buyer_id,
                rating: row.rating,
                body: row.body,
                createdAt: row.created_at,
                updatedAt: row.updated_at
            };
            db.productReviews.set(row.id, review);
        }
    }

    if (conversationsRes.data) {
        db.conversations.clear();
        for (const row of conversationsRes.data as ConversationRow[]) {
            const conv: ConversationRecord = {
                id: row.id,
                buyerId: row.buyer_id,
                sellerId: row.seller_id,
                updatedAt: row.updated_at
            };
            db.conversations.set(row.id, conv);
        }
    }

    if (conversationMessagesRes.data) {
        db.conversationMessages.clear();
        for (const row of conversationMessagesRes.data as ConversationMessageRow[]) {
            const msg: ConversationMessageRecord = {
                id: row.id,
                conversationId: row.conversation_id,
                senderId: row.sender_id,
                body: row.body,
                createdAt: row.created_at
            };
            db.conversationMessages.set(row.id, msg);
        }
    }

    await loadAuthUsersIntoRuntime(supabase);

    lastSyncAt = Date.now();
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(
            "[refreshRuntimeStateFromSupabase]",
            message,
            "(check SUPABASE_URL and Docker; run `npm run supabase:status` from repo root)"
        );
    }
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
            shop_latitude: profile.shopLatitude ?? null,
            shop_longitude: profile.shopLongitude ?? null,
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

export async function persistSellerPaymentMethod(row: SellerPaymentMethod): Promise<void> {
    const supabase = createSupabaseAdminClient();
    if (!supabase) {
        return;
    }
    const { error } = await supabase.from("app_seller_payment_methods").upsert(
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
    if (error) {
        console.error("[persistSellerPaymentMethod]", error.message);
        throw new Error(`Failed to persist payment method: ${error.message}`);
    }
}

export async function deleteSellerPaymentMethod(id: string): Promise<void> {
    const supabase = createSupabaseAdminClient();
    if (!supabase) {
        return;
    }
    const { error } = await supabase.from("app_seller_payment_methods").delete().eq("id", id);
    if (error) {
        console.error("[deleteSellerPaymentMethod]", error.message);
        throw new Error(`Failed to delete payment method: ${error.message}`);
    }
}

export async function persistVerification(row: VerificationSubmission): Promise<void> {
    const supabase = createSupabaseAdminClient();
    if (!supabase) return;
    const { error } = await supabase.from("app_verifications").upsert(
        {
            id: row.id,
            seller_id: row.sellerId,
            permit_file_url: row.permitFileUrl,
            permit_object_path: row.permitObjectPath ?? null,
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

export function deleteVerificationById(id: string): void {
    const supabase = createSupabaseAdminClient();
    if (!supabase) return;
    void supabase.from("app_verifications").delete().eq("id", id);
}

export function deleteSellerProfileBySellerId(sellerId: string): void {
    const supabase = createSupabaseAdminClient();
    if (!supabase) return;
    void supabase.from("app_seller_profiles").delete().eq("seller_id", sellerId);
}

export function deleteSellerStatusBySellerId(sellerId: string): void {
    const supabase = createSupabaseAdminClient();
    if (!supabase) return;
    void supabase.from("app_seller_status").delete().eq("seller_id", sellerId);
}

export async function persistSellerLocationChangeRequest(
    row: SellerLocationChangeRequest
): Promise<void> {
    const supabase = createSupabaseAdminClient();
    if (!supabase) {
        return;
    }
    const { error } = await supabase.from("app_seller_location_requests").upsert(
        {
            id: row.id,
            seller_id: row.sellerId,
            requested_latitude: row.requestedLatitude,
            requested_longitude: row.requestedLongitude,
            previous_latitude: row.previousLatitude ?? null,
            previous_longitude: row.previousLongitude ?? null,
            note: row.note ?? null,
            status: row.status,
            created_at: row.createdAt,
            reviewed_at: row.reviewedAt ?? null,
            rejection_reason: row.rejectionReason ?? null
        },
        { onConflict: "id" }
    );
    if (error) {
        console.error("[persistSellerLocationChangeRequest]", error.message);
        throw new Error(`Failed to persist location request: ${error.message}`);
    }
}

export function deleteSellerLocationRequestsBySellerId(sellerId: string): void {
    const supabase = createSupabaseAdminClient();
    if (!supabase) {
        return;
    }
    void supabase.from("app_seller_location_requests").delete().eq("seller_id", sellerId);
}

/**
 * Persists product to Supabase before returning API success. Required so the next request
 * (upload-url, PATCH) is not wiped by `syncFromSupabaseIfStale` reloading an empty/partial DB view.
 */
export async function persistProduct(row: ProductRecord): Promise<void> {
    const supabase = createSupabaseAdminClient();
    if (!supabase) {
        return;
    }
    const { error } = await supabase.from("app_products").upsert(
        {
            id: row.id,
            seller_id: row.sellerId,
            title: row.title,
            description: row.description,
            base_price: row.basePrice,
            is_published: row.isPublished,
            model_3d_url: row.model3dUrl ?? null,
            made_to_order: row.madeToOrder,
            stock_quantity:
                row.madeToOrder ? null : (row.stockQuantity ?? null),
            is_featured: row.isFeatured,
            video_url: row.videoUrl ?? null
        },
        { onConflict: "id" }
    );
    if (error) {
        console.error("[persistProduct]", error.message);
        throw new Error(`Failed to persist product: ${error.message}`);
    }
}

export function deleteProduct(productId: string): void {
    const supabase = createSupabaseAdminClient();
    if (!supabase) return;
    void supabase.from("app_products").delete().eq("id", productId);
}

export async function persistProductMedia(row: ProductMedia): Promise<void> {
    const supabase = createSupabaseAdminClient();
    if (!supabase) {
        return;
    }
    const { error } = await supabase.from("app_product_media").upsert(
        { id: row.id, product_id: row.productId, url: row.url },
        { onConflict: "id" }
    );
    if (error) {
        console.error("[persistProductMedia]", error.message);
        throw new Error(`Failed to persist product media: ${error.message}`);
    }
}

export async function deleteProductMedia(mediaId: string): Promise<void> {
    const supabase = createSupabaseAdminClient();
    if (!supabase) {
        return;
    }
    const { error } = await supabase.from("app_product_media").delete().eq("id", mediaId);
    if (error) {
        console.error("[deleteProductMedia]", error.message);
        throw new Error(`Failed to delete product media: ${error.message}`);
    }
}

export async function persistCustomizationOption(row: CustomizationOption): Promise<void> {
    const supabase = createSupabaseAdminClient();
    if (!supabase) {
        return;
    }
    const { error } = await supabase
        .from("app_customization_options")
        .upsert(
            { id: row.id, product_id: row.productId, name: row.name, values: row.values },
            { onConflict: "id" }
        );
    if (error) {
        console.error("[persistCustomizationOption]", error.message);
        throw new Error(`Failed to persist customization option: ${error.message}`);
    }
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

export async function deleteCustomizationOptionById(optionId: string): Promise<void> {
    const supabase = createSupabaseAdminClient();
    if (!supabase) {
        return;
    }
    const { error } = await supabase.from("app_customization_options").delete().eq("id", optionId);
    if (error) {
        console.error("[deleteCustomizationOptionById]", error.message);
        throw new Error(`Failed to delete customization option: ${error.message}`);
    }
}

export function deleteCustomizationRulesByProduct(productId: string): void {
    const supabase = createSupabaseAdminClient();
    if (!supabase) return;
    void supabase.from("app_customization_rules").delete().eq("product_id", productId);
}

export async function deleteProductMediaByProduct(productId: string): Promise<void> {
    const supabase = createSupabaseAdminClient();
    if (!supabase) {
        return;
    }
    const { error } = await supabase.from("app_product_media").delete().eq("product_id", productId);
    if (error) {
        console.error("[deleteProductMediaByProduct]", error.message);
        throw new Error(`Failed to delete product media: ${error.message}`);
    }
}

function isMissingCartSelectionsColumnError(error: { message?: string; code?: string }): boolean {
    const msg = (error.message ?? "").toLowerCase();
    if (error.code === "42703" && msg.includes("selections")) {
        return true;
    }
    if (!msg.includes("selections")) {
        return false;
    }
    return (
        msg.includes("column") ||
        msg.includes("does not exist") ||
        msg.includes("could not find") ||
        msg.includes("unknown column") ||
        msg.includes("schema cache")
    );
}

export async function persistCartItem(row: CartItem): Promise<void> {
    const supabase = createSupabaseAdminClient();
    if (!supabase) {
        return;
    }
    const selections = Array.isArray(row.selections) ? row.selections : [];
    const basePayload = {
        id: row.id,
        buyer_id: row.buyerId ?? null,
        guest_session_id: row.guestSessionId ?? null,
        product_id: row.productId,
        quantity: row.quantity
    };
    let { error } = await supabase
        .from("app_cart_items")
        .upsert({ ...basePayload, selections }, { onConflict: "id" });
    if (error && isMissingCartSelectionsColumnError(error)) {
        console.warn(
            "[persistCartItem] Retrying without selections (apply migration 0031_cart_and_line_item_selections.sql)"
        );
        ({ error } = await supabase.from("app_cart_items").upsert(basePayload, { onConflict: "id" }));
    }
    if (error) {
        console.error("[persistCartItem]", error.message);
        throw new Error(`Failed to persist cart item: ${error.message}`);
    }
}

export async function deleteCartItem(cartItemId: string): Promise<void> {
    const supabase = createSupabaseAdminClient();
    if (!supabase) {
        return;
    }
    const { error } = await supabase.from("app_cart_items").delete().eq("id", cartItemId);
    if (error) {
        console.error("[deleteCartItem]", error.message);
        throw new Error(`Failed to delete cart item: ${error.message}`);
    }
}

/**
 * Persists order to Supabase before returning API success. Required so the global
 * `syncFromSupabaseIfStale` middleware does not reload from DB and drop in-memory-only orders.
 */
export async function persistOrder(row: OrderRecord): Promise<void> {
    const supabase = createSupabaseAdminClient();
    if (!supabase) {
        return;
    }
    const { error } = await supabase.from("app_orders").upsert(
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
            created_at: row.createdAt,
            receipt_proof_url: row.receiptProofUrl ?? null,
            seller_payment_method_id: row.sellerPaymentMethodId ?? null,
            estimated_delivery_start_at: row.estimatedDeliveryStartAt ?? null,
            estimated_delivery_end_at: row.estimatedDeliveryEndAt ?? null,
            estimated_delivery_range_display: row.estimatedDeliveryRangeDisplay ?? null,
            shipping_recipient_name: row.shippingRecipientName ?? null,
            shipping_address_line: row.shippingAddressLine ?? null,
            shipping_city: row.shippingCity ?? null,
            shipping_postal_code: row.shippingPostalCode ?? null,
            shipping_contact_number: row.shippingContactNumber ?? null,
            delivery_notes: row.deliveryNotes ?? null,
            cancellation_reason: row.cancellationReason ?? null,
            quality_checklist: row.qualityChecklist ?? null
        },
        { onConflict: "id" }
    );
    if (error) {
        console.error("[persistOrder]", error.message);
        throw new Error(`Failed to persist order: ${error.message}`);
    }
}

export async function persistOrderLineItem(row: OrderLineItemRecord): Promise<void> {
    const supabase = createSupabaseAdminClient();
    if (!supabase) {
        return;
    }
    const selections = Array.isArray(row.selections) ? row.selections : [];
    const basePayload = {
        id: row.id,
        order_id: row.orderId,
        product_id: row.productId,
        quantity: row.quantity,
        created_at: row.createdAt
    };
    let { error } = await supabase
        .from("app_order_line_items")
        .upsert({ ...basePayload, selections }, { onConflict: "id" });
    if (error && isMissingCartSelectionsColumnError(error)) {
        console.warn(
            "[persistOrderLineItem] Retrying without selections (apply migration 0031_cart_and_line_item_selections.sql)"
        );
        ({ error } = await supabase.from("app_order_line_items").upsert(basePayload, { onConflict: "id" }));
    }
    if (error) {
        console.error("[persistOrderLineItem]", error.message);
        throw new Error(`Failed to persist order line item: ${error.message}`);
    }
}

export function deleteOrderLineItem(lineItemId: string): void {
    const supabase = createSupabaseAdminClient();
    if (!supabase) return;
    void supabase.from("app_order_line_items").delete().eq("id", lineItemId);
}

/**
 * Persists a single order thread message. When Supabase is configured, failures throw
 * (callers should roll back in-memory state for user-sent messages). Without Supabase,
 * messages exist only in memory until the API process restarts.
 */
export async function persistOrderMessage(row: OrderMessage): Promise<void> {
    const supabase = createSupabaseAdminClient();
    if (!supabase) {
        console.warn(
            "[persistOrderMessage] Supabase not configured; order messages are not written to the database."
        );
        return;
    }
    const { error } = await supabase.from("app_order_messages").upsert(
        {
            id: row.id,
            order_id: row.orderId,
            sender_id: row.senderId,
            body: row.body,
            created_at: row.createdAt
        },
        { onConflict: "id" }
    );
    if (error) {
        console.error("[persistOrderMessage]", error.message, error);
        throw new Error(`Failed to persist order message: ${error.message}`);
    }
}

export async function persistProductReview(row: ProductReviewRecord): Promise<void> {
    const supabase = createSupabaseAdminClient();
    if (!supabase) {
        return;
    }
    const { error } = await supabase.from("app_product_reviews").upsert(
        {
            id: row.id,
            product_id: row.productId,
            buyer_id: row.buyerId,
            rating: row.rating,
            body: row.body,
            created_at: row.createdAt,
            updated_at: row.updatedAt
        },
        { onConflict: "id" }
    );
    if (error) {
        console.error("[persistProductReview]", error.message);
        throw new Error(`Failed to persist product review: ${error.message}`);
    }
}

export async function deleteProductReviewById(reviewId: string): Promise<void> {
    const supabase = createSupabaseAdminClient();
    if (!supabase) {
        return;
    }
    const { error } = await supabase.from("app_product_reviews").delete().eq("id", reviewId);
    if (error) {
        console.error("[deleteProductReviewById]", error.message);
        throw new Error(`Failed to delete product review: ${error.message}`);
    }
}

export async function persistConversation(row: ConversationRecord): Promise<void> {
    const supabase = createSupabaseAdminClient();
    if (!supabase) {
        return;
    }
    const { error } = await supabase.from("app_conversations").upsert(
        {
            id: row.id,
            buyer_id: row.buyerId,
            seller_id: row.sellerId,
            updated_at: row.updatedAt
        },
        { onConflict: "id" }
    );
    if (error) {
        console.error("[persistConversation]", error.message);
        throw new Error(`Failed to persist conversation: ${error.message}`);
    }
}

export async function persistConversationMessage(row: ConversationMessageRecord): Promise<void> {
    const supabase = createSupabaseAdminClient();
    if (!supabase) {
        return;
    }
    const { error } = await supabase.from("app_conversation_messages").upsert(
        {
            id: row.id,
            conversation_id: row.conversationId,
            sender_id: row.senderId,
            body: row.body,
            created_at: row.createdAt
        },
        { onConflict: "id" }
    );
    if (error) {
        console.error("[persistConversationMessage]", error.message);
        throw new Error(`Failed to persist direct message: ${error.message}`);
    }
}
