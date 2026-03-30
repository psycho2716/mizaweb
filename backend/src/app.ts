import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import jwt from "jsonwebtoken";
import morgan from "morgan";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { env } from "./config/env";
import { authorizeRole } from "./middleware/authorize-role";
import { authenticate, resolveOptionalAuthUserId } from "./middleware/authenticate";
import { parseAndValidateCartSelections, snapshotSelectionsForOrderLine } from "./lib/cart-selections";
import {
    cartSelectionsEqual,
    maxPurchasableUnits,
    ownerCartItems,
    totalQuantityForProduct
} from "./lib/cart-line-merge";
import { db } from "./lib/store";
import {
    createSupabaseAdminClient,
    createSupabaseAnonClient,
    isSupabaseAuthReady,
    isSupabaseConfigured
} from "./integrations/supabase/client";
import {
    deleteCartItem,
    deleteOrderLineItem,
    deleteCustomizationOptionsByProduct,
    deleteCustomizationRulesByProduct,
    deleteProduct,
    deleteProductMedia,
    deleteProductMediaByProduct,
    deleteProductReviewById,
    deleteSellerLocationRequestsBySellerId,
    deleteSellerPaymentMethod,
    deleteSellerProfileBySellerId,
    deleteSellerStatusBySellerId,
    deleteVerificationById,
    persistCartItem,
    persistCustomizationOption,
    persistCustomizationRule,
    persistConversation,
    persistConversationMessage,
    persistOrder,
    persistOrderLineItem,
    persistOrderMessage,
    persistProduct,
    persistProductMedia,
    persistProductReview,
    persistSellerLocationChangeRequest,
    persistSellerPaymentMethod,
    persistSellerStatus,
    persistSellerProfile,
    persistVerification,
    syncFromSupabaseIfStale
} from "./integrations/supabase/persistence";
import {
    generateGlbUrlFromImageBuffer,
    generateGlbUrlFromImageUrl,
    isNsfwContentRejectedError
} from "./lib/fal-image-to-3d";
import { hashPassword, verifyPassword } from "./lib/password";
import {
    PRODUCT_COLORS_OPTION_NAME,
    PRODUCT_DIMENSIONS_OPTION_NAME,
    syncProductDimensionAndColorOptions
} from "./lib/product-customization";
import { buildBuyerOrdersSummary } from "./lib/buyer-orders-summary";
import { buildSellerOrdersSummary } from "./lib/seller-orders-summary";
import { buildBuyerReviewsDashboard } from "./lib/buyer-reviews-dashboard";
import {
    resolveEstimatedDeliveryForOrder,
    type EstimatedDeliveryInput
} from "./lib/estimated-delivery";
import {
    checkoutShippingSnapshotFromBody,
    type CheckoutShippingBody
} from "./lib/checkout-shipping-snapshot";
import { getReviewEligibilityForBuyer } from "./lib/review-eligibility";
import {
    rewriteLocalSupabaseUrl,
    rewriteProductMediaForClient,
    rewriteProductRecordForClient
} from "./lib/supabase-asset-url";
import { emitDirectMessage, emitOrderMessage, emitOrderUpdated } from "./lib/realtime";
import {
    createSignedVerificationDownloadUrl,
    extractVerificationObjectPath,
    generateVerificationUploadTarget,
    getVerificationDocsCanonicalUrl,
    mockVerificationDocsAssetUrl,
    normalizeVerificationDocsStoredUrl,
    resolveVerificationDocsReadUrl
} from "./modules/verification/verification-storage";
import type {
    AuthUser,
    ConversationRecord,
    OrderLineItemRecord,
    ProductRecord,
    SellerLocationChangeRequest,
    SellerPaymentMethod,
    SellerProfile
} from "./types/domain";

const app = express();

async function withResolvedSellerProfileMedia(profile: SellerProfile): Promise<SellerProfile> {
    const [resolvedPic, resolvedBg] = await Promise.all([
        resolveVerificationDocsReadUrl(profile.profileImageUrl),
        resolveVerificationDocsReadUrl(profile.storeBackgroundUrl)
    ]);
    const out: SellerProfile = {
        sellerId: profile.sellerId,
        businessName: profile.businessName,
        contactNumber: profile.contactNumber,
        address: profile.address
    };
    if (profile.shopLatitude !== undefined) {
        out.shopLatitude = profile.shopLatitude;
    }
    if (profile.shopLongitude !== undefined) {
        out.shopLongitude = profile.shopLongitude;
    }
    const pic = resolvedPic ?? profile.profileImageUrl;
    const bg = resolvedBg ?? profile.storeBackgroundUrl;
    if (pic !== undefined) {
        out.profileImageUrl = pic;
    }
    if (bg !== undefined) {
        out.storeBackgroundUrl = bg;
    }
    return out;
}

async function withResolvedPaymentQrImages(methods: SellerPaymentMethod[]): Promise<SellerPaymentMethod[]> {
    return Promise.all(
        methods.map(async (method) => {
            if (!method.qrImageUrl) {
                return method;
            }
            const qrImageUrl = await resolveVerificationDocsReadUrl(method.qrImageUrl);
            return { ...method, qrImageUrl: qrImageUrl ?? method.qrImageUrl };
        })
    );
}

function pendingSellerLocationRequest(sellerId: string): SellerLocationChangeRequest | null {
    const match = [...db.sellerLocationRequests.values()].find(
        (r) => r.sellerId === sellerId && r.status === "pending"
    );
    return match ?? null;
}

function removeSellerLocationRequestsFromRuntime(sellerId: string): void {
    for (const r of [...db.sellerLocationRequests.values()]) {
        if (r.sellerId === sellerId) {
            db.sellerLocationRequests.delete(r.id);
        }
    }
    deleteSellerLocationRequestsBySellerId(sellerId);
}

function productReviewSummaryForProduct(productId: string): {
    averageRating: number | null;
    reviewCount: number;
} {
    const list = [...db.productReviews.values()].filter((r) => r.productId === productId);
    if (list.length === 0) {
        return { averageRating: null, reviewCount: 0 };
    }
    const sum = list.reduce((acc, r) => acc + r.rating, 0);
    return {
        averageRating: Math.round((sum / list.length) * 10) / 10,
        reviewCount: list.length
    };
}

function sellerReviewAggregate(sellerId: string): {
    averageRating: number | null;
    reviewCount: number;
} {
    const publishedIds = new Set(
        [...db.products.values()]
            .filter((p) => p.sellerId === sellerId && p.isPublished)
            .map((p) => p.id)
    );
    const list = [...db.productReviews.values()].filter((r) => publishedIds.has(r.productId));
    if (list.length === 0) {
        return { averageRating: null, reviewCount: 0 };
    }
    const sum = list.reduce((acc, r) => acc + r.rating, 0);
    return {
        averageRating: Math.round((sum / list.length) * 10) / 10,
        reviewCount: list.length
    };
}

function firstProductThumbnailUrl(productId: string): string | undefined {
    const media = [...db.productMedia.values()].filter((m) => m.productId === productId);
    const raw = [...media].sort((a, b) => a.id.localeCompare(b.id))[0]?.url;
    return rewriteLocalSupabaseUrl(raw);
}

function reviewerDisplayLabel(buyerId: string): string {
    const user = db.users.get(buyerId);
    if (user?.fullName?.trim()) {
        return user.fullName.trim();
    }
    const tail = buyerId.length >= 4 ? buyerId.slice(-4) : buyerId;
    return `Buyer · ${tail}`;
}

function findDirectConversation(buyerId: string, sellerId: string): ConversationRecord | undefined {
    return [...db.conversations.values()].find(
        (c) => c.buyerId === buyerId && c.sellerId === sellerId
    );
}

/** In-memory buyer-owned data (Supabase CASCADE handles persisted rows when auth user is deleted). */
async function clearBuyerAssociatedRuntimeData(buyerId: string): Promise<void> {
    for (const item of [...db.cartItems.values()]) {
        if (item.buyerId === buyerId) {
            db.cartItems.delete(item.id);
            try {
                await deleteCartItem(item.id);
            } catch (error) {
                console.error("[clearBuyerAssociatedRuntimeData] cart item", error);
            }
        }
    }
    for (const order of [...db.orders.values()]) {
        if (order.buyerId === buyerId) {
            for (const line of [...db.orderLineItems.values()]) {
                if (line.orderId === order.id) {
                    db.orderLineItems.delete(line.id);
                    deleteOrderLineItem(line.id);
                }
            }
            for (const m of [...db.orderMessages.values()]) {
                if (m.orderId === order.id) {
                    db.orderMessages.delete(m.id);
                }
            }
            db.orders.delete(order.id);
        }
    }
    for (const r of [...db.productReviews.values()]) {
        if (r.buyerId === buyerId) {
            db.productReviews.delete(r.id);
        }
    }
    for (const conv of [...db.conversations.values()]) {
        if (conv.buyerId === buyerId) {
            for (const cm of [...db.conversationMessages.values()]) {
                if (cm.conversationId === conv.id) {
                    db.conversationMessages.delete(cm.id);
                }
            }
            db.conversations.delete(conv.id);
        }
    }
}

async function cleanupBuyerRuntimeStateAfterAuthDeletion(buyerId: string): Promise<void> {
    if (!isSupabaseAuthReady()) {
        for (const [email, cred] of [...db.credentials.entries()]) {
            if (cred.userId === buyerId) {
                db.credentials.delete(email);
            }
        }
    }
    await clearBuyerAssociatedRuntimeData(buyerId);
    db.users.delete(buyerId);
}

async function adminDeleteUserAccount(
    targetId: string,
    actorId: string
): Promise<{ ok: true } | { error: string; status: number }> {
    if (targetId === actorId) {
        return { error: "Cannot delete your own account", status: 400 };
    }
    const target = db.users.get(targetId);
    if (!target) {
        return { error: "Not found", status: 404 };
    }
    if (target.role === "admin") {
        const admins = [...db.users.values()].filter((u) => u.role === "admin");
        if (admins.length < 2) {
            return { error: "Cannot remove the last administrator", status: 400 };
        }
    }
    if (isSupabaseAuthReady()) {
        const supabaseAdmin = createSupabaseAdminClient();
        if (!supabaseAdmin) {
            return { error: "Authentication service unavailable", status: 503 };
        }
        const { error } = await supabaseAdmin.auth.admin.deleteUser(targetId);
        if (error) {
            return { error: error.message, status: 500 };
        }
    } else {
        for (const [email, cred] of [...db.credentials.entries()]) {
            if (cred.userId === targetId) {
                db.credentials.delete(email);
            }
        }
    }
    if (target.role === "seller") {
        for (const v of [...db.verifications.values()]) {
            if (v.sellerId === targetId) {
                db.verifications.delete(v.id);
                deleteVerificationById(v.id);
            }
        }
        removeSellerLocationRequestsFromRuntime(targetId);
        for (const m of [...db.sellerPaymentMethods.values()]) {
            if (m.sellerId === targetId) {
                try {
                    await deleteSellerPaymentMethod(m.id);
                } catch (error) {
                    console.error("[adminDeleteUserAccount] payment method", error);
                }
                db.sellerPaymentMethods.delete(m.id);
            }
        }
        db.sellerProfiles.delete(targetId);
        deleteSellerProfileBySellerId(targetId);
        db.sellerStatus.delete(targetId);
        deleteSellerStatusBySellerId(targetId);
    }
    if (target.role === "buyer") {
        await clearBuyerAssociatedRuntimeData(targetId);
    }
    db.users.delete(targetId);
    return { ok: true };
}

app.use(helmet());
app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
app.use(morgan("dev"));
app.use(express.json({ limit: "12mb" }));
app.use(cookieParser());
app.use((request, response, next) => {
    const requestId = request.header("x-request-id") ?? randomUUID();
    response.setHeader("x-request-id", requestId);
    next();
});
app.use(async (_request, _response, next) => {
    try {
        await syncFromSupabaseIfStale();
        next();
    } catch (error) {
        next(error);
    }
});

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60 });
const searchLimiter = rateLimit({ windowMs: 60 * 1000, max: 120 });

function getGuestSessionId(request: express.Request): string | null {
    const sessionId = request.header("x-guest-session-id");
    return sessionId && sessionId.trim().length > 0 ? sessionId.trim() : null;
}

/** Moves guest-session lines onto the buyer so logged-in shoppers see pre-login cart items. */
async function mergeGuestCartIntoBuyer(
    buyerId: string,
    guestSessionId: string | null
): Promise<void> {
    if (!guestSessionId) {
        return;
    }
    const guestItems = [...db.cartItems.values()].filter(
        (entry) => entry.guestSessionId === guestSessionId
    );
    for (const item of guestItems) {
        item.buyerId = buyerId;
        delete item.guestSessionId;
        if (!Array.isArray(item.selections)) {
            item.selections = [];
        }
        await persistCartItem(item);
    }
}

function parseListPagination(query: express.Request["query"]): { page: number; limit: number } {
    const rawPage = typeof query.page === "string" ? Number.parseInt(query.page, 10) : Number.NaN;
    const rawLimit = typeof query.limit === "string" ? Number.parseInt(query.limit, 10) : Number.NaN;
    const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
    const limitRaw = Number.isFinite(rawLimit) && rawLimit >= 1 ? Math.floor(rawLimit) : 10;
    const limit = Math.min(100, Math.max(1, limitRaw));
    return { page, limit };
}

function slicePaginated<T>(
    items: T[],
    requestedPage: number,
    limit: number
): {
    data: T[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
} {
    const total = items.length;
    const totalPages = total === 0 ? 1 : Math.ceil(total / limit);
    const safePage = Math.min(Math.max(1, requestedPage), totalPages);
    const offset = (safePage - 1) * limit;
    return {
        data: items.slice(offset, offset + limit),
        pagination: {
            page: safePage,
            limit,
            total,
            totalPages
        }
    };
}

app.get("/health", (_request, response) => {
    response.json({
        ok: true,
        service: "backend",
        environment: env.NODE_ENV,
        storageProvider: isSupabaseConfigured() ? "supabase" : "in-memory"
    });
});

app.post("/auth/register", authLimiter, async (request, response) => {
    const schema = z
        .object({
            email: z.string().email(),
            password: z.string().min(8).max(128),
            role: z.enum(["buyer", "seller"]),
            fullName: z.string().min(2).max(120).optional(),
            businessName: z.string().min(2).max(120).optional(),
            contactNumber: z.string().min(7).max(40).optional(),
            address: z.string().min(3).max(255).optional(),
            shopLatitude: z.number().gte(-90).lte(90).optional(),
            shopLongitude: z.number().gte(-180).lte(180).optional()
        })
        .superRefine((values, context) => {
            if (values.role === "seller") {
                if (!values.fullName) {
                    context.addIssue({
                        code: z.ZodIssueCode.custom,
                        message: "Full name is required for seller registration",
                        path: ["fullName"]
                    });
                }
                if (!values.businessName) {
                    context.addIssue({
                        code: z.ZodIssueCode.custom,
                        message: "Business name is required for seller registration",
                        path: ["businessName"]
                    });
                }
                if (!values.contactNumber) {
                    context.addIssue({
                        code: z.ZodIssueCode.custom,
                        message: "Contact number is required for seller registration",
                        path: ["contactNumber"]
                    });
                }
                if (!values.address) {
                    context.addIssue({
                        code: z.ZodIssueCode.custom,
                        message: "Business address is required for seller registration",
                        path: ["address"]
                    });
                }
                if (values.shopLatitude === undefined || values.shopLongitude === undefined) {
                    context.addIssue({
                        code: z.ZodIssueCode.custom,
                        message: "Pin your shop location on the map",
                        path: ["shopLatitude"]
                    });
                }
            }
        });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
        response.status(400).json({ error: parsed.error.flatten() });
        return;
    }

    const normalizedEmail = parsed.data.email.toLowerCase();
    const existingUser = [...db.users.values()].find(
        (entry) => entry.email.toLowerCase() === normalizedEmail
    );
    if (existingUser) {
        response.status(409).json({ error: "Email is already registered" });
        return;
    }

    if (isSupabaseAuthReady()) {
        const admin = createSupabaseAdminClient();
        const anon = createSupabaseAnonClient();
        if (!admin || !anon) {
            response.status(503).json({ error: "Authentication service unavailable" });
            return;
        }

        const { data: created, error: createErr } = await admin.auth.admin.createUser({
            email: normalizedEmail,
            password: parsed.data.password,
            email_confirm: true,
            user_metadata: {
                role: parsed.data.role,
                ...(parsed.data.fullName ? { full_name: parsed.data.fullName } : {})
            }
        });

        if (createErr || !created.user) {
            const msg = createErr?.message ?? "Registration failed";
            const lower = msg.toLowerCase();
            if (lower.includes("already") || lower.includes("registered")) {
                response.status(409).json({ error: "Email is already registered" });
                return;
            }
            response.status(400).json({ error: msg });
            return;
        }

        const id = created.user.id;
        const user = {
            id,
            email: normalizedEmail,
            role: parsed.data.role,
            ...(parsed.data.fullName ? { fullName: parsed.data.fullName } : {})
        };

        db.users.set(id, user);
        if (user.role === "seller") {
            db.sellerStatus.set(id, "unsubmitted");
            db.sellerProfiles.set(id, {
                sellerId: id,
                businessName: parsed.data.businessName as string,
                contactNumber: parsed.data.contactNumber as string,
                address: parsed.data.address as string,
                shopLatitude: parsed.data.shopLatitude as number,
                shopLongitude: parsed.data.shopLongitude as number
            });
        }

        try {
            if (user.role === "seller") {
                await persistSellerStatus(id, "unsubmitted");
                await persistSellerProfile(db.sellerProfiles.get(id)!);
            }
        } catch (error) {
            await admin.auth.admin.deleteUser(id);
            db.users.delete(id);
            if (user.role === "seller") {
                db.sellerStatus.delete(id);
                db.sellerProfiles.delete(id);
            }
            console.error("[register] persist", error);
            response.status(500).json({
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to save account. Please try again."
            });
            return;
        }

        const { data: sessionData, error: signErr } = await anon.auth.signInWithPassword({
            email: normalizedEmail,
            password: parsed.data.password
        });

        if (signErr || !sessionData.session) {
            console.error("[register] signIn", signErr);
            response.status(500).json({
                error: signErr?.message ?? "Failed to create session"
            });
            return;
        }

        response.status(201).json({
            token: sessionData.session.access_token,
            refreshToken: sessionData.session.refresh_token,
            user
        });
        return;
    }

    const id = `u-${randomUUID()}`;
    const user = {
        id,
        email: normalizedEmail,
        role: parsed.data.role,
        ...(parsed.data.fullName ? { fullName: parsed.data.fullName } : {})
    };
    const passwordHash = hashPassword(parsed.data.password);
    db.users.set(id, user);
    db.credentials.set(normalizedEmail, { userId: id, passwordHash });
    if (user.role === "seller") {
        db.sellerStatus.set(id, "unsubmitted");
        db.sellerProfiles.set(id, {
            sellerId: id,
            businessName: parsed.data.businessName as string,
            contactNumber: parsed.data.contactNumber as string,
            address: parsed.data.address as string,
            shopLatitude: parsed.data.shopLatitude as number,
            shopLongitude: parsed.data.shopLongitude as number
        });
    }

    try {
        if (user.role === "seller") {
            await persistSellerStatus(id, "unsubmitted");
            await persistSellerProfile(db.sellerProfiles.get(id)!);
        }
    } catch (error) {
        db.users.delete(id);
        db.credentials.delete(normalizedEmail);
        if (user.role === "seller") {
            db.sellerStatus.delete(id);
            db.sellerProfiles.delete(id);
        }
        console.error("[register] persist", error);
        response.status(500).json({
            error:
                error instanceof Error
                    ? error.message
                    : "Failed to save account. Please try again."
        });
        return;
    }

    const token = jwt.sign({ sub: user.id, role: user.role }, env.JWT_SECRET, {
        expiresIn: "2h"
    });

    response.status(201).json({ token, user });
});

app.post("/auth/login", authLimiter, async (request, response) => {
    const schema = z.object({
        email: z.string().email(),
        password: z.string().min(8).max(128)
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
        response.status(400).json({ error: parsed.error.flatten() });
        return;
    }

    const normalizedEmail = parsed.data.email.toLowerCase();

    if (isSupabaseAuthReady()) {
        const anon = createSupabaseAnonClient();
        if (!anon) {
            response.status(503).json({ error: "Authentication service unavailable" });
            return;
        }
        const { data, error } = await anon.auth.signInWithPassword({
            email: normalizedEmail,
            password: parsed.data.password
        });
        if (error || !data.session || !data.user) {
            response.status(401).json({ error: "Invalid email or password" });
            return;
        }
        await syncFromSupabaseIfStale();
        const user = db.users.get(data.user.id);
        if (!user) {
            response.status(403).json({
                error: "Account profile is missing. Contact support."
            });
            return;
        }
        const bannedUntil = (data.user as { banned_until?: string | null }).banned_until;
        if (
            bannedUntil &&
            Number.isFinite(new Date(bannedUntil).getTime()) &&
            new Date(bannedUntil).getTime() > Date.now()
        ) {
            response.status(403).json({ error: "Account suspended" });
            return;
        }
        if (user.suspended) {
            response.status(403).json({ error: "Account suspended" });
            return;
        }
        response.json({
            token: data.session.access_token,
            refreshToken: data.session.refresh_token,
            user
        });
        return;
    }

    const credentials = db.credentials.get(normalizedEmail);
    if (!credentials || !verifyPassword(parsed.data.password, credentials.passwordHash)) {
        response.status(401).json({ error: "Invalid email or password" });
        return;
    }

    const user = db.users.get(credentials.userId);
    if (!user) {
        response.status(404).json({ error: "User not found" });
        return;
    }
    if (user.suspended) {
        response.status(403).json({ error: "Account suspended" });
        return;
    }

    const token = jwt.sign({ sub: user.id, role: user.role }, env.JWT_SECRET, {
        expiresIn: "2h"
    });
    response.json({ token, user });
});

app.post("/auth/refresh", authLimiter, async (request, response) => {
    const schema = z.object({
        refreshToken: z.string().min(10).max(4096)
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
        response.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    if (!isSupabaseAuthReady()) {
        response.status(501).json({ error: "Session refresh is not available" });
        return;
    }
    const anon = createSupabaseAnonClient();
    if (!anon) {
        response.status(503).json({ error: "Authentication service unavailable" });
        return;
    }
    const { data, error } = await anon.auth.refreshSession({
        refresh_token: parsed.data.refreshToken
    });
    if (error || !data.session || !data.user) {
        response.status(401).json({
            error: error?.message ?? "Session expired. Please sign in again."
        });
        return;
    }
    await syncFromSupabaseIfStale();
    const user = db.users.get(data.user.id);
    if (!user) {
        response.status(403).json({
            error: "Account profile is missing. Contact support."
        });
        return;
    }
    if (user.suspended) {
        response.status(403).json({ error: "Account suspended" });
        return;
    }
    response.json({
        token: data.session.access_token,
        refreshToken: data.session.refresh_token,
        user
    });
});

app.post("/auth/logout", authenticate, (_request, response) => {
    response.json({ ok: true });
});

app.get("/auth/me", authenticate, (request, response) => {
    response.json({ user: db.users.get(request.authUserId as string) });
});

app.get("/sellers/:id/profile", async (request, response) => {
    const id = z.string().min(1).parse(request.params.id);
    const seller = db.users.get(id);
    const profile = db.sellerProfiles.get(id);
    const paymentMethods = [...db.sellerPaymentMethods.values()].filter(
        (entry) => entry.sellerId === id
    );
    if (!seller || seller.role !== "seller" || !profile) {
        response.status(404).json({ error: "Seller profile not found" });
        return;
    }
    const reviewAgg = sellerReviewAggregate(id);
    const resolvedProfile = await withResolvedSellerProfileMedia(profile);
    const resolvedPayments = await withResolvedPaymentQrImages(paymentMethods);
    const storefrontProducts = [...db.products.values()]
        .filter((product) => product.sellerId === id && product.isPublished)
        .map((p) => ({
            ...rewriteProductRecordForClient(p),
            thumbnailUrl: firstProductThumbnailUrl(p.id)
        }))
        .sort((a, b) => {
            if (Boolean(a.isFeatured) !== Boolean(b.isFeatured)) {
                return a.isFeatured ? -1 : 1;
            }
            return a.title.localeCompare(b.title);
        });
    response.json({
        data: {
            id: seller.id,
            email: seller.email,
            ...resolvedProfile,
            paymentMethods: resolvedPayments,
            verificationStatus: db.sellerStatus.get(id) ?? "unsubmitted",
            publishedProducts: storefrontProducts.length,
            averageRating: reviewAgg.averageRating,
            reviewCount: reviewAgg.reviewCount,
            storefrontProducts
        }
    });
});

app.get("/seller/profile", authenticate, authorizeRole(["seller"]), async (request, response) => {
    const sellerId = request.authUserId as string;
    const profile = db.sellerProfiles.get(sellerId);
    const user = db.users.get(sellerId);
    if (!profile) {
        response.status(404).json({ error: "Seller profile not found" });
        return;
    }
    const reviewAgg = sellerReviewAggregate(sellerId);
    const paymentMethods = [...db.sellerPaymentMethods.values()].filter(
        (entry) => entry.sellerId === sellerId
    );
    const resolvedProfile = await withResolvedSellerProfileMedia(profile);
    const resolvedPayments = await withResolvedPaymentQrImages(paymentMethods);
    response.json({
        data: {
            id: sellerId,
            ...resolvedProfile,
            paymentMethods: resolvedPayments,
            fullName: user?.fullName,
            email: user?.email,
            verificationStatus: db.sellerStatus.get(sellerId) ?? "unsubmitted",
            publishedProducts: [...db.products.values()].filter(
                (product) => product.sellerId === sellerId && product.isPublished
            ).length,
            averageRating: reviewAgg.averageRating,
            reviewCount: reviewAgg.reviewCount,
            pendingLocationRequest: pendingSellerLocationRequest(sellerId)
        }
    });
});

app.patch("/seller/profile", authenticate, authorizeRole(["seller"]), async (request, response) => {
    const schema = z.object({
        fullName: z.string().min(2).max(120).optional(),
        businessName: z.string().min(2).max(120).optional(),
        contactNumber: z.string().min(7).max(40).optional(),
        address: z.string().min(3).max(255).optional(),
        profileImageUrl: z.string().url().optional(),
        storeBackgroundUrl: z.string().url().optional()
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
        response.status(400).json({ error: parsed.error.flatten() });
        return;
    }

    const profile = db.sellerProfiles.get(request.authUserId as string);
    if (!profile) {
        response.status(404).json({ error: "Seller profile not found" });
        return;
    }

    const previous = {
        businessName: profile.businessName,
        contactNumber: profile.contactNumber,
        address: profile.address,
        profileImageUrl: profile.profileImageUrl,
        storeBackgroundUrl: profile.storeBackgroundUrl
    };

    profile.businessName = parsed.data.businessName ?? profile.businessName;
    profile.contactNumber = parsed.data.contactNumber ?? profile.contactNumber;
    profile.address = parsed.data.address ?? profile.address;
    if (parsed.data.profileImageUrl) {
        profile.profileImageUrl =
            normalizeVerificationDocsStoredUrl(parsed.data.profileImageUrl) ??
            parsed.data.profileImageUrl;
    }
    if (parsed.data.storeBackgroundUrl) {
        profile.storeBackgroundUrl =
            normalizeVerificationDocsStoredUrl(parsed.data.storeBackgroundUrl) ??
            parsed.data.storeBackgroundUrl;
    }

    const sellerId = request.authUserId as string;
    const user = db.users.get(sellerId);
    const previousFullName = user?.fullName;
    if (user && parsed.data.fullName) {
        user.fullName = parsed.data.fullName;
    }

    try {
        if (user && parsed.data.fullName && isSupabaseAuthReady()) {
            const supabase = createSupabaseAdminClient();
            if (supabase) {
                const { error } = await supabase.auth.admin.updateUserById(sellerId, {
                    user_metadata: {
                        role: user.role,
                        full_name: parsed.data.fullName
                    }
                });
                if (error) {
                    throw new Error(error.message);
                }
            }
        }
        await persistSellerProfile(profile);
    } catch (error) {
        if (user) {
            if (previousFullName !== undefined) {
                user.fullName = previousFullName;
            } else {
                delete user.fullName;
            }
        }
        profile.businessName = previous.businessName;
        profile.contactNumber = previous.contactNumber;
        profile.address = previous.address;
        if (previous.profileImageUrl !== undefined) {
            profile.profileImageUrl = previous.profileImageUrl;
        } else {
            delete profile.profileImageUrl;
        }
        if (previous.storeBackgroundUrl !== undefined) {
            profile.storeBackgroundUrl = previous.storeBackgroundUrl;
        } else {
            delete profile.storeBackgroundUrl;
        }
        console.error("[seller/profile] persist", error);
        response.status(500).json({
            error: error instanceof Error ? error.message : "Failed to update profile"
        });
        return;
    }

    response.json({ ok: true, data: profile });
});

app.post("/seller/location-request", authenticate, authorizeRole(["seller"]), async (request, response) => {
    const schema = z.object({
        shopLatitude: z.number().gte(-90).lte(90),
        shopLongitude: z.number().gte(-180).lte(180),
        note: z.string().max(500).optional()
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
        response.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    const sellerId = request.authUserId as string;
    const hasPending = [...db.sellerLocationRequests.values()].some(
        (r) => r.sellerId === sellerId && r.status === "pending"
    );
    if (hasPending) {
        response.status(409).json({
            error: "You already have a pending shop location request. Wait for admin review."
        });
        return;
    }
    const profile = db.sellerProfiles.get(sellerId);
    if (!profile) {
        response.status(404).json({ error: "Seller profile not found" });
        return;
    }
    const id = `slr-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const row: SellerLocationChangeRequest = {
        id,
        sellerId,
        requestedLatitude: parsed.data.shopLatitude,
        requestedLongitude: parsed.data.shopLongitude,
        status: "pending",
        createdAt: new Date().toISOString(),
        ...(Number.isFinite(profile.shopLatitude) && Number.isFinite(profile.shopLongitude)
            ? {
                  previousLatitude: profile.shopLatitude as number,
                  previousLongitude: profile.shopLongitude as number
              }
            : {}),
        ...(parsed.data.note && parsed.data.note.trim().length > 0
            ? { note: parsed.data.note.trim() }
            : {})
    };
    try {
        await persistSellerLocationChangeRequest(row);
        db.sellerLocationRequests.set(id, row);
        response.status(201).json({ data: row });
    } catch (error) {
        console.error("[seller/location-request]", error);
        response.status(500).json({
            error: error instanceof Error ? error.message : "Failed to submit request"
        });
    }
});

app.get(
    "/seller/payment-methods",
    authenticate,
    authorizeRole(["seller"]),
    async (request, response) => {
        const sellerId = request.authUserId as string;
        const data = [...db.sellerPaymentMethods.values()].filter(
            (entry) => entry.sellerId === sellerId
        );
        const resolved = await withResolvedPaymentQrImages(data);
        response.json({ data: resolved });
    }
);

app.post(
    "/seller/payment-methods",
    authenticate,
    authorizeRole(["seller"]),
    async (request, response) => {
        const schema = z.object({
            methodName: z.string().min(2).max(60),
            accountName: z.string().min(2).max(120),
            accountNumber: z.string().min(2).max(80),
            qrImageUrl: z.string().url().optional()
        });
        const parsed = schema.safeParse(request.body);
        if (!parsed.success) {
            response.status(400).json({ error: parsed.error.flatten() });
            return;
        }
        const id = `spm-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const row = {
            id,
            sellerId: request.authUserId as string,
            methodName: parsed.data.methodName,
            accountName: parsed.data.accountName,
            accountNumber: parsed.data.accountNumber,
            ...(parsed.data.qrImageUrl
                ? {
                      qrImageUrl:
                          normalizeVerificationDocsStoredUrl(parsed.data.qrImageUrl) ??
                          parsed.data.qrImageUrl
                  }
                : {})
        };
        db.sellerPaymentMethods.set(id, row);
        try {
            await persistSellerPaymentMethod(row);
        } catch (error) {
            db.sellerPaymentMethods.delete(id);
            console.error("[POST /seller/payment-methods]", error);
            response.status(500).json({
                error: error instanceof Error ? error.message : "Failed to save payment method"
            });
            return;
        }
        response.status(201).json({ data: row });
    }
);

app.patch(
    "/seller/payment-methods/:id",
    authenticate,
    authorizeRole(["seller"]),
    async (request, response) => {
        const id = z.string().min(1).parse(request.params.id);
        const row = db.sellerPaymentMethods.get(id);
        if (!row || row.sellerId !== request.authUserId) {
            response.status(404).json({ error: "Payment method not found" });
            return;
        }
        const schema = z.object({
            methodName: z.string().min(2).max(60).optional(),
            accountName: z.string().min(2).max(120).optional(),
            accountNumber: z.string().min(2).max(80).optional(),
            qrImageUrl: z.string().url().optional()
        });
        const parsed = schema.safeParse(request.body);
        if (!parsed.success) {
            response.status(400).json({ error: parsed.error.flatten() });
            return;
        }
        const previous = { ...row };
        row.methodName = parsed.data.methodName ?? row.methodName;
        row.accountName = parsed.data.accountName ?? row.accountName;
        row.accountNumber = parsed.data.accountNumber ?? row.accountNumber;
        if (parsed.data.qrImageUrl) {
            row.qrImageUrl =
                normalizeVerificationDocsStoredUrl(parsed.data.qrImageUrl) ?? parsed.data.qrImageUrl;
        }
        try {
            await persistSellerPaymentMethod(row);
        } catch (error) {
            db.sellerPaymentMethods.set(id, previous);
            console.error("[PATCH /seller/payment-methods/:id]", error);
            response.status(500).json({
                error: error instanceof Error ? error.message : "Failed to update payment method"
            });
            return;
        }
        response.json({ data: row });
    }
);

app.delete(
    "/seller/payment-methods/:id",
    authenticate,
    authorizeRole(["seller"]),
    async (request, response) => {
        const id = z.string().min(1).parse(request.params.id);
        const row = db.sellerPaymentMethods.get(id);
        if (!row || row.sellerId !== request.authUserId) {
            response.status(404).json({ error: "Payment method not found" });
            return;
        }
        try {
            await deleteSellerPaymentMethod(id);
        } catch (error) {
            console.error("[DELETE /seller/payment-methods/:id]", error);
            response.status(500).json({
                error: error instanceof Error ? error.message : "Failed to delete payment method"
            });
            return;
        }
        db.sellerPaymentMethods.delete(id);
        response.json({ ok: true });
    }
);

app.patch(
    "/seller/account/password",
    authenticate,
    authorizeRole(["seller"]),
    async (request, response) => {
        if (!isSupabaseAuthReady()) {
            response.status(503).json({ error: "Password update requires Supabase Auth setup" });
            return;
        }
        const schema = z.object({
            currentPassword: z.string().min(8),
            newPassword: z.string().min(8).max(128)
        });
        const parsed = schema.safeParse(request.body);
        if (!parsed.success) {
            response.status(400).json({ error: parsed.error.flatten() });
            return;
        }
        const user = db.users.get(request.authUserId as string);
        if (!user) {
            response.status(404).json({ error: "User not found" });
            return;
        }
        const anon = createSupabaseAnonClient();
        const admin = createSupabaseAdminClient();
        if (!anon || !admin) {
            response.status(503).json({ error: "Authentication service unavailable" });
            return;
        }
        const { error: signErr } = await anon.auth.signInWithPassword({
            email: user.email,
            password: parsed.data.currentPassword
        });
        if (signErr) {
            response.status(401).json({ error: "Current password is incorrect" });
            return;
        }
        const { error: updateErr } = await admin.auth.admin.updateUserById(user.id, {
            password: parsed.data.newPassword
        });
        if (updateErr) {
            response.status(500).json({ error: updateErr.message });
            return;
        }
        response.json({ ok: true });
    }
);

app.delete(
    "/seller/account",
    authenticate,
    authorizeRole(["seller"]),
    async (request, response) => {
        if (!isSupabaseAuthReady()) {
            response.status(503).json({ error: "Account deletion requires Supabase Auth setup" });
            return;
        }
        const schema = z.object({ password: z.string().min(8) });
        const parsed = schema.safeParse(request.body);
        if (!parsed.success) {
            response.status(400).json({ error: parsed.error.flatten() });
            return;
        }
        const user = db.users.get(request.authUserId as string);
        if (!user) {
            response.status(404).json({ error: "User not found" });
            return;
        }
        const anon = createSupabaseAnonClient();
        const admin = createSupabaseAdminClient();
        if (!anon || !admin) {
            response.status(503).json({ error: "Authentication service unavailable" });
            return;
        }
        const { error: signErr } = await anon.auth.signInWithPassword({
            email: user.email,
            password: parsed.data.password
        });
        if (signErr) {
            response.status(401).json({ error: "Password is incorrect" });
            return;
        }
        const { error: deleteErr } = await admin.auth.admin.deleteUser(user.id);
        if (deleteErr) {
            response.status(500).json({ error: deleteErr.message });
            return;
        }
        db.users.delete(user.id);
        db.sellerProfiles.delete(user.id);
        db.sellerStatus.delete(user.id);
        removeSellerLocationRequestsFromRuntime(user.id);
        for (const method of [...db.sellerPaymentMethods.values()]) {
            if (method.sellerId === user.id) {
                db.sellerPaymentMethods.delete(method.id);
            }
        }
        response.json({ ok: true });
    }
);

app.patch(
    "/buyer/account/password",
    authenticate,
    authorizeRole(["buyer"]),
    async (request, response) => {
        if (!isSupabaseAuthReady()) {
            response.status(503).json({ error: "Password update requires Supabase Auth setup" });
            return;
        }
        const schema = z.object({
            currentPassword: z.string().min(8),
            newPassword: z.string().min(8).max(128)
        });
        const parsed = schema.safeParse(request.body);
        if (!parsed.success) {
            response.status(400).json({ error: parsed.error.flatten() });
            return;
        }
        const user = db.users.get(request.authUserId as string);
        if (!user) {
            response.status(404).json({ error: "User not found" });
            return;
        }
        const anon = createSupabaseAnonClient();
        const admin = createSupabaseAdminClient();
        if (!anon || !admin) {
            response.status(503).json({ error: "Authentication service unavailable" });
            return;
        }
        const { error: signErr } = await anon.auth.signInWithPassword({
            email: user.email,
            password: parsed.data.currentPassword
        });
        if (signErr) {
            response.status(401).json({ error: "Current password is incorrect" });
            return;
        }
        const { error: updateErr } = await admin.auth.admin.updateUserById(user.id, {
            password: parsed.data.newPassword
        });
        if (updateErr) {
            response.status(500).json({ error: updateErr.message });
            return;
        }
        response.json({ ok: true });
    }
);

app.delete(
    "/buyer/account",
    authenticate,
    authorizeRole(["buyer"]),
    async (request, response) => {
        if (!isSupabaseAuthReady()) {
            response.status(503).json({ error: "Account deletion requires Supabase Auth setup" });
            return;
        }
        const schema = z.object({ password: z.string().min(8) });
        const parsed = schema.safeParse(request.body);
        if (!parsed.success) {
            response.status(400).json({ error: parsed.error.flatten() });
            return;
        }
        const user = db.users.get(request.authUserId as string);
        if (!user) {
            response.status(404).json({ error: "User not found" });
            return;
        }
        const anon = createSupabaseAnonClient();
        const admin = createSupabaseAdminClient();
        if (!anon || !admin) {
            response.status(503).json({ error: "Authentication service unavailable" });
            return;
        }
        const { error: signErr } = await anon.auth.signInWithPassword({
            email: user.email,
            password: parsed.data.password
        });
        if (signErr) {
            response.status(401).json({ error: "Password is incorrect" });
            return;
        }
        const { error: deleteErr } = await admin.auth.admin.deleteUser(user.id);
        if (deleteErr) {
            response.status(500).json({ error: deleteErr.message });
            return;
        }
        await cleanupBuyerRuntimeStateAfterAuthDeletion(user.id);
        response.json({ ok: true });
    }
);

app.patch("/buyer/profile", authenticate, authorizeRole(["buyer"]), async (request, response) => {
    const schema = z.object({
        fullName: z.string().min(2).max(120).optional(),
        profileImageUrl: z.string().url().optional(),
        contactNumber: z.string().max(32).optional(),
        shippingAddressLine: z.string().max(255).optional(),
        shippingCity: z.string().max(120).optional(),
        shippingPostalCode: z.string().max(12).optional()
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
        response.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    const buyerId = request.authUserId as string;
    const buyerRow = db.users.get(buyerId);
    if (!buyerRow || buyerRow.role !== "buyer") {
        response.status(404).json({ error: "User not found" });
        return;
    }
    const buyer = buyerRow;

    if (parsed.data.contactNumber !== undefined) {
        const digits = parsed.data.contactNumber.replace(/\D/g, "");
        if (digits.length === 0) {
            /* clear */
        } else if (digits.length < 10) {
            response.status(400).json({
                error: "Contact number must be at least 10 digits, or leave empty to clear."
            });
            return;
        }
    }
    if (parsed.data.shippingAddressLine !== undefined) {
        const t = parsed.data.shippingAddressLine.trim();
        if (t.length > 0 && t.length < 3) {
            response.status(400).json({ error: "Street address must be at least 3 characters." });
            return;
        }
    }
    if (parsed.data.shippingCity !== undefined) {
        const t = parsed.data.shippingCity.trim();
        if (t.length > 0 && t.length < 2) {
            response.status(400).json({ error: "City must be at least 2 characters." });
            return;
        }
    }
    if (parsed.data.shippingPostalCode !== undefined) {
        const digits = parsed.data.shippingPostalCode.replace(/\D/g, "");
        if (digits.length > 0 && digits.length < 4) {
            response.status(400).json({ error: "Postal code must be at least 4 digits." });
            return;
        }
    }

    const previousFullName = buyer.fullName;
    const previousPic = buyer.profileImageUrl;
    const previousContact = buyer.contactNumber;
    const previousAddr = buyer.shippingAddressLine;
    const previousCity = buyer.shippingCity;
    const previousPostal = buyer.shippingPostalCode;

    if (parsed.data.fullName !== undefined) {
        buyer.fullName = parsed.data.fullName;
    }
    if (parsed.data.profileImageUrl !== undefined) {
        buyer.profileImageUrl = parsed.data.profileImageUrl;
    }
    if (parsed.data.contactNumber !== undefined) {
        const digits = parsed.data.contactNumber.replace(/\D/g, "");
        if (digits.length === 0) {
            delete buyer.contactNumber;
        } else {
            buyer.contactNumber = digits;
        }
    }
    if (parsed.data.shippingAddressLine !== undefined) {
        const t = parsed.data.shippingAddressLine.trim();
        if (t.length === 0) {
            delete buyer.shippingAddressLine;
        } else {
            buyer.shippingAddressLine = t;
        }
    }
    if (parsed.data.shippingCity !== undefined) {
        const t = parsed.data.shippingCity.trim();
        if (t.length === 0) {
            delete buyer.shippingCity;
        } else {
            buyer.shippingCity = t;
        }
    }
    if (parsed.data.shippingPostalCode !== undefined) {
        const digits = parsed.data.shippingPostalCode.replace(/\D/g, "");
        if (digits.length === 0) {
            delete buyer.shippingPostalCode;
        } else {
            buyer.shippingPostalCode = digits;
        }
    }

    function restoreBuyerProfileSnapshot(): void {
        if (previousFullName !== undefined) {
            buyer.fullName = previousFullName;
        } else {
            delete buyer.fullName;
        }
        if (previousPic !== undefined) {
            buyer.profileImageUrl = previousPic;
        } else {
            delete buyer.profileImageUrl;
        }
        if (previousContact !== undefined) {
            buyer.contactNumber = previousContact;
        } else {
            delete buyer.contactNumber;
        }
        if (previousAddr !== undefined) {
            buyer.shippingAddressLine = previousAddr;
        } else {
            delete buyer.shippingAddressLine;
        }
        if (previousCity !== undefined) {
            buyer.shippingCity = previousCity;
        } else {
            delete buyer.shippingCity;
        }
        if (previousPostal !== undefined) {
            buyer.shippingPostalCode = previousPostal;
        } else {
            delete buyer.shippingPostalCode;
        }
    }

    try {
        if (isSupabaseAuthReady()) {
            const supabase = createSupabaseAdminClient();
            if (!supabase) {
                throw new Error("Authentication service unavailable");
            }
            const { data: existing, error: getErr } = await supabase.auth.admin.getUserById(buyerId);
            if (getErr || !existing.user) {
                throw new Error(getErr?.message ?? "User not found in auth");
            }
            const meta: Record<string, unknown> = {
                ...((existing.user.user_metadata ?? {}) as Record<string, unknown>),
                role: buyer.role
            };
            if (parsed.data.fullName !== undefined) {
                meta.full_name = parsed.data.fullName;
            }
            if (parsed.data.profileImageUrl !== undefined) {
                meta.profile_image_url = parsed.data.profileImageUrl;
            }
            if (parsed.data.contactNumber !== undefined) {
                if (buyer.contactNumber) {
                    meta.contact_number = buyer.contactNumber;
                } else {
                    delete meta.contact_number;
                }
            }
            if (parsed.data.shippingAddressLine !== undefined) {
                if (buyer.shippingAddressLine) {
                    meta.shipping_address_line = buyer.shippingAddressLine;
                } else {
                    delete meta.shipping_address_line;
                }
            }
            if (parsed.data.shippingCity !== undefined) {
                if (buyer.shippingCity) {
                    meta.shipping_city = buyer.shippingCity;
                } else {
                    delete meta.shipping_city;
                }
            }
            if (parsed.data.shippingPostalCode !== undefined) {
                if (buyer.shippingPostalCode) {
                    meta.shipping_postal_code = buyer.shippingPostalCode;
                } else {
                    delete meta.shipping_postal_code;
                }
            }
            const { error: upErr } = await supabase.auth.admin.updateUserById(buyerId, {
                user_metadata: meta
            });
            if (upErr) {
                throw new Error(upErr.message);
            }
        }
        db.users.set(buyerId, buyer);
    } catch (error) {
        restoreBuyerProfileSnapshot();
        console.error("[buyer/profile]", error);
        response.status(500).json({
            error: error instanceof Error ? error.message : "Failed to update profile"
        });
        return;
    }
    response.json({ ok: true, data: buyer });
});

app.post(
    "/buyer/assets/upload-url",
    authenticate,
    authorizeRole(["buyer"]),
    async (request, response) => {
        const schema = z.object({
            filename: z.string().min(3).max(255),
            kind: z.enum(["profile", "payment-receipt"]).optional().default("profile")
        });
        const parsed = schema.safeParse(request.body);
        if (!parsed.success) {
            response.status(400).json({ error: parsed.error.flatten() });
            return;
        }
        const target = await generateVerificationUploadTarget(
            request.authUserId as string,
            parsed.data.filename,
            parsed.data.kind === "payment-receipt" ? "payment-receipt" : "profile"
        );
        response.status(201).json(target);
    }
);

app.get("/buyer/orders/summary", authenticate, authorizeRole(["buyer"]), (request, response) => {
    const buyerId = request.authUserId as string;
    response.json({ data: buildBuyerOrdersSummary(buyerId) });
});

app.get("/seller/orders/summary", authenticate, authorizeRole(["seller"]), (request, response) => {
    const sellerId = request.authUserId as string;
    response.json({ data: buildSellerOrdersSummary(sellerId) });
});

app.get("/buyer/reviews", authenticate, authorizeRole(["buyer"]), (request, response) => {
    const buyerId = request.authUserId as string;
    const dashboard = buildBuyerReviewsDashboard(buyerId);
    response.json({ data: dashboard });
});

app.delete(
    "/buyer/reviews/:reviewId",
    authenticate,
    authorizeRole(["buyer"]),
    async (request, response) => {
        const reviewId = z.string().min(1).parse(request.params.reviewId);
        const review = db.productReviews.get(reviewId);
        if (!review || review.buyerId !== (request.authUserId as string)) {
            response.status(404).json({ error: "Not found" });
            return;
        }
        db.productReviews.delete(reviewId);
        try {
            await deleteProductReviewById(reviewId);
        } catch (error) {
            db.productReviews.set(reviewId, review);
            response.status(500).json({
                error: error instanceof Error ? error.message : "Failed to delete review"
            });
            return;
        }
        response.json({ ok: true });
    }
);

app.post(
    "/seller/verification/upload-url",
    authenticate,
    authorizeRole(["seller"]),
    async (request, response) => {
        const schema = z.object({
            filename: z.string().min(3).max(255)
        });
        const parsed = schema.safeParse(request.body);
        if (!parsed.success) {
            response.status(400).json({ error: parsed.error.flatten() });
            return;
        }

        const target = await generateVerificationUploadTarget(
            request.authUserId as string,
            parsed.data.filename
        );

        response.status(201).json(target);
    }
);

app.post(
    "/seller/assets/upload-url",
    authenticate,
    authorizeRole(["seller"]),
    async (request, response) => {
        const schema = z.object({
            filename: z.string().min(3).max(255),
            kind: z.enum(["profile", "background", "payment-qr"])
        });
        const parsed = schema.safeParse(request.body);
        if (!parsed.success) {
            response.status(400).json({ error: parsed.error.flatten() });
            return;
        }

        const target = await generateVerificationUploadTarget(
            request.authUserId as string,
            parsed.data.filename,
            parsed.data.kind
        );

        response.status(201).json(target);
    }
);

app.post(
    "/seller/assets/read-url",
    authenticate,
    authorizeRole(["seller"]),
    async (request, response) => {
        const schema = z.object({
            path: z
                .string()
                .min(3)
                .max(512)
                .regex(/^[a-zA-Z0-9._/-]+$/, "Invalid path")
        });
        const parsed = schema.safeParse(request.body);
        if (!parsed.success) {
            response.status(400).json({ error: parsed.error.flatten() });
            return;
        }
        const sellerId = request.authUserId as string;
        const prefix = `${sellerId}/`;
        if (!parsed.data.path.startsWith(prefix)) {
            response.status(403).json({ error: "Invalid asset path" });
            return;
        }

        const canonicalUrl =
            getVerificationDocsCanonicalUrl(parsed.data.path) ??
            mockVerificationDocsAssetUrl(parsed.data.path);
        const signed = await createSignedVerificationDownloadUrl(parsed.data.path, 60 * 60 * 24 * 7);
        const readUrl = signed ?? canonicalUrl;

        response.status(200).json({
            readUrl,
            canonicalUrl
        });
    }
);

app.post(
    "/seller/verification/submit",
    authenticate,
    authorizeRole(["seller"]),
    async (request, response) => {
        const schema = z.object({
            permitFileUrl: z.string().url(),
            note: z.string().max(1000).optional(),
            permitObjectPath: z
                .string()
                .min(3)
                .max(512)
                .regex(/^[a-zA-Z0-9._/-]+$/, "Invalid storage path")
                .optional()
        });
        const parsed = schema.safeParse(request.body);
        if (!parsed.success) {
            response.status(400).json({ error: parsed.error.flatten() });
            return;
        }

        const id = `v-${Date.now()}`;
        const submission = {
            id,
            sellerId: request.authUserId as string,
            permitFileUrl: parsed.data.permitFileUrl,
            status: "pending" as const,
            ...(parsed.data.permitObjectPath
                ? { permitObjectPath: parsed.data.permitObjectPath }
                : {}),
            ...(parsed.data.note ? { note: parsed.data.note } : {})
        };
        try {
            await persistVerification(submission);
            await persistSellerStatus(request.authUserId as string, "pending");
        } catch (error) {
            console.error("[verification/submit]", error);
            response.status(500).json({
                error: error instanceof Error ? error.message : "Failed to save verification"
            });
            return;
        }
        db.verifications.set(id, { ...submission });
        db.sellerStatus.set(request.authUserId as string, "pending");
        response.status(201).json({ id, status: "pending" });
    }
);

app.get(
    "/seller/verification/status",
    authenticate,
    authorizeRole(["seller"]),
    (request, response) => {
        const sellerId = request.authUserId as string;
        const status = db.sellerStatus.get(sellerId) ?? "unsubmitted";
        const rejectedForSeller = [...db.verifications.values()]
            .filter((v) => v.sellerId === sellerId && v.status === "rejected")
            .sort((a, b) => b.id.localeCompare(a.id));
        const latestRejected = rejectedForSeller[0];
        response.json({
            status,
            ...(status === "rejected" && latestRejected?.rejectionReason
                ? { rejectionReason: latestRejected.rejectionReason }
                : {})
        });
    }
);

app.post(
    "/seller/verification/resubmit",
    authenticate,
    authorizeRole(["seller"]),
    async (request, response) => {
        const schema = z.object({
            permitFileUrl: z.string().url(),
            note: z.string().max(1000).optional(),
            permitObjectPath: z
                .string()
                .min(3)
                .max(512)
                .regex(/^[a-zA-Z0-9._/-]+$/, "Invalid storage path")
                .optional()
        });
        const parsed = schema.safeParse(request.body);
        if (!parsed.success) {
            response.status(400).json({ error: parsed.error.flatten() });
            return;
        }

        const id = `v-${Date.now()}`;
        const submission = {
            id,
            sellerId: request.authUserId as string,
            permitFileUrl: parsed.data.permitFileUrl,
            status: "pending" as const,
            ...(parsed.data.permitObjectPath
                ? { permitObjectPath: parsed.data.permitObjectPath }
                : {}),
            ...(parsed.data.note ? { note: parsed.data.note } : {})
        };
        try {
            await persistVerification(submission);
            await persistSellerStatus(request.authUserId as string, "pending");
        } catch (error) {
            console.error("[verification/resubmit]", error);
            response.status(500).json({
                error: error instanceof Error ? error.message : "Failed to save verification"
            });
            return;
        }
        db.verifications.set(id, submission);
        db.sellerStatus.set(request.authUserId as string, "pending");
        response.status(201).json({ id, status: "pending" });
    }
);

app.get("/admin/verifications", authenticate, authorizeRole(["admin"]), (request, response) => {
    const status = request.query.status;
    const { page, limit } = parseListPagination(request.query);
    const rows = [...db.verifications.values()]
        .filter((entry) => (typeof status === "string" ? entry.status === status : true))
        .sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
        .map((entry) => {
            const seller = db.users.get(entry.sellerId);
            const profile = db.sellerProfiles.get(entry.sellerId);
            const paymentMethods = [...db.sellerPaymentMethods.values()].filter(
                (method) => method.sellerId === entry.sellerId
            );
            return {
                ...entry,
                seller: seller
                    ? {
                          id: seller.id,
                          email: seller.email,
                          fullName: seller.fullName
                      }
                    : null,
                profile: profile ?? null,
                paymentMethods
            };
        });
    const { data, pagination } = slicePaginated(rows, page, limit);
    response.json({ data, pagination });
});

app.get("/admin/verifications/:id", authenticate, authorizeRole(["admin"]), (request, response) => {
    const id = z.string().min(1).parse(request.params.id);
    const verification = db.verifications.get(id);
    if (!verification) {
        response.status(404).json({ error: "Not found" });
        return;
    }
    const seller = db.users.get(verification.sellerId);
    const profile = db.sellerProfiles.get(verification.sellerId);
    const paymentMethods = [...db.sellerPaymentMethods.values()].filter(
        (method) => method.sellerId === verification.sellerId
    );
    response.json({
        data: {
            ...verification,
            seller: seller
                ? {
                      id: seller.id,
                      email: seller.email,
                      fullName: seller.fullName
                  }
                : null,
            profile: profile ?? null,
            paymentMethods
        }
    });
});

app.get(
    "/admin/verifications/:id/permit-url",
    authenticate,
    authorizeRole(["admin"]),
    async (request, response) => {
        const id = z.string().min(1).parse(request.params.id);
        const verification = db.verifications.get(id);
        if (!verification) {
            response.status(404).json({ error: "Not found" });
            return;
        }
        const trimmedPath = verification.permitObjectPath?.trim();
        const objectPath =
            trimmedPath && trimmedPath.length > 0
                ? trimmedPath
                : extractVerificationObjectPath(verification.permitFileUrl);
        if (!objectPath) {
            response.status(400).json({
                error: "Could not resolve permit file path from stored URL"
            });
            return;
        }
        const url = await createSignedVerificationDownloadUrl(objectPath, 3600);
        if (!url) {
            response.status(503).json({
                error: "Storage is not configured or signed URL could not be created"
            });
            return;
        }
        response.json({ url });
    }
);

app.post(
    "/admin/verifications/:id/approve",
    authenticate,
    authorizeRole(["admin"]),
    async (request, response) => {
        const id = z.string().min(1).parse(request.params.id);
        const verification = db.verifications.get(id);
        if (!verification) {
            response.status(404).json({ error: "Not found" });
            return;
        }
        const previousStatus = verification.status;
        const previousSellerStatus = db.sellerStatus.get(verification.sellerId);
        verification.status = "approved";
        try {
            await persistVerification(verification);
            await persistSellerStatus(verification.sellerId, "approved");
        } catch (error) {
            verification.status = previousStatus;
            if (previousSellerStatus !== undefined) {
                db.sellerStatus.set(verification.sellerId, previousSellerStatus);
            }
            console.error("[admin/approve]", error);
            response.status(500).json({
                error: error instanceof Error ? error.message : "Failed to persist approval"
            });
            return;
        }
        db.sellerStatus.set(verification.sellerId, "approved");
        response.json({ ok: true });
    }
);

app.post(
    "/admin/verifications/:id/reject",
    authenticate,
    authorizeRole(["admin"]),
    async (request, response) => {
        const schema = z.object({ reason: z.string().min(3).max(500) });
        const parsed = schema.safeParse(request.body);
        if (!parsed.success) {
            response.status(400).json({ error: parsed.error.flatten() });
            return;
        }

        const id = z.string().min(1).parse(request.params.id);
        const verification = db.verifications.get(id);
        if (!verification) {
            response.status(404).json({ error: "Not found" });
            return;
        }
        const previousStatus = verification.status;
        const previousReason = verification.rejectionReason;
        const previousSellerStatus = db.sellerStatus.get(verification.sellerId);
        verification.status = "rejected";
        verification.rejectionReason = parsed.data.reason;
        try {
            await persistVerification(verification);
            await persistSellerStatus(verification.sellerId, "rejected");
        } catch (error) {
            verification.status = previousStatus;
            if (previousReason !== undefined) {
                verification.rejectionReason = previousReason;
            } else {
                delete verification.rejectionReason;
            }
            if (previousSellerStatus !== undefined) {
                db.sellerStatus.set(verification.sellerId, previousSellerStatus);
            }
            console.error("[admin/reject]", error);
            response.status(500).json({
                error: error instanceof Error ? error.message : "Failed to persist rejection"
            });
            return;
        }
        db.sellerStatus.set(verification.sellerId, "rejected");
        response.json({ ok: true });
    }
);

app.get("/seller/analytics", authenticate, authorizeRole(["seller"]), (request, response) => {
    const sellerId = request.authUserId as string;
    const orders = [...db.orders.values()].filter((entry) => entry.sellerId === sellerId);
    const now = new Date();
    const thisMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const paidOrders = orders.filter((entry) => entry.paymentStatus === "paid");
    const monthlyRevenue = paidOrders
        .filter((entry) => entry.createdAt.slice(0, 7) === thisMonth)
        .reduce((sum, entry) => sum + entry.totalAmount, 0);
    const pendingOrders = orders.filter(
        (entry) => entry.status === "created" || entry.status === "confirmed"
    ).length;
    const toShipOrders = orders.filter((entry) => entry.status === "processing").length;
    const deliveredOrders = orders.filter((entry) => entry.status === "delivered").length;
    const unpaidOnlineOrders = orders.filter(
        (entry) =>
            entry.status !== "cancelled" &&
            entry.paymentMethod === "online" &&
            entry.paymentStatus !== "paid"
    ).length;
    const products = [...db.products.values()].filter((entry) => entry.sellerId === sellerId);
    const publishedProducts = products.filter((entry) => entry.isPublished).length;

    response.json({
        data: {
            monthlyRevenue,
            pendingOrders,
            toShipOrders,
            deliveredOrders,
            unpaidOnlineOrders,
            totalProducts: products.length,
            publishedProducts
        }
    });
});

app.get("/seller/products", authenticate, authorizeRole(["seller"]), (request, response) => {
    const sellerId = request.authUserId as string;
    const data = [...db.products.values()]
        .filter((row) => row.sellerId === sellerId)
        .map((row) => ({
            ...rewriteProductRecordForClient(row),
            thumbnailUrl: firstProductThumbnailUrl(row.id)
        }));
    response.json({ data });
});

app.get("/seller/products/:id", authenticate, authorizeRole(["seller"]), (request, response) => {
    const id = z.string().min(1).parse(request.params.id);
    const product = db.products.get(id);
    if (!product || product.sellerId !== request.authUserId) {
        response.status(404).json({ error: "Not found" });
        return;
    }
    const media = [...db.productMedia.values()].filter((entry) => entry.productId === id);
    const options = [...db.customizationOptions.values()].filter((entry) => entry.productId === id);
    const rules = [...db.customizationRules.values()].filter((entry) => entry.productId === id);
    const reviewSummary = productReviewSummaryForProduct(id);
    response.json({
        data: {
            ...rewriteProductRecordForClient(product),
            media: rewriteProductMediaForClient(media),
            options,
            rules,
            reviewSummary
        }
    });
});

const createProductBodySchema = z
    .object({
        title: z.string().min(2),
        description: z.string().min(3),
        basePrice: z.number().positive(),
        madeToOrder: z.boolean().optional(),
        stockQuantity: z.number().int().min(0).optional(),
        isFeatured: z.boolean().optional(),
        dimensionChoices: z.array(z.string()).optional().default([]),
        colorChoices: z.array(z.string()).optional().default([]),
        imageUrls: z.array(z.string().url()).max(5).optional().default([]),
        videoUrl: z.union([z.string().url(), z.literal("")]).optional(),
        model3dUrl: z.string().url().optional()
    })
    .transform((data) => {
        const madeToOrder = data.madeToOrder === true;
        return {
            ...data,
            madeToOrder,
            isFeatured: data.isFeatured === true,
            stockQuantity: madeToOrder ? undefined : (data.stockQuantity ?? 0)
        };
    });

app.post("/products", authenticate, authorizeRole(["seller"]), async (request, response) => {
    const parsed = createProductBodySchema.safeParse(request.body);
    if (!parsed.success) {
        response.status(400).json({ error: parsed.error.flatten() });
        return;
    }

    const id = `p-${Date.now()}`;
    const videoUrl =
        parsed.data.videoUrl && parsed.data.videoUrl.length > 0 ? parsed.data.videoUrl : undefined;
    const product = {
        id,
        sellerId: request.authUserId as string,
        title: parsed.data.title,
        description: parsed.data.description,
        basePrice: parsed.data.basePrice,
        isPublished: false,
        madeToOrder: parsed.data.madeToOrder,
        stockQuantity: parsed.data.madeToOrder ? undefined : parsed.data.stockQuantity,
        isFeatured: parsed.data.isFeatured,
        ...(videoUrl ? { videoUrl } : {}),
        ...(parsed.data.model3dUrl ? { model3dUrl: parsed.data.model3dUrl } : {})
    };
    db.products.set(id, product as ProductRecord);
    try {
        await persistProduct(product as ProductRecord);
    } catch (err) {
        db.products.delete(id);
        response.status(500).json({
            error: err instanceof Error ? err.message : "Failed to save product"
        });
        return;
    }

    for (const url of parsed.data.imageUrls) {
        const mediaId = `pm-${randomUUID()}`;
        const media = { id: mediaId, productId: id, url };
        db.productMedia.set(mediaId, media);
        try {
            await persistProductMedia(media);
        } catch (err) {
            response.status(500).json({
                error: err instanceof Error ? err.message : "Failed to save product images"
            });
            return;
        }
    }

    try {
        await syncProductDimensionAndColorOptions(
            id,
            parsed.data.dimensionChoices,
            parsed.data.colorChoices
        );
    } catch (err) {
        response.status(500).json({
            error: err instanceof Error ? err.message : "Failed to save dimension/color options"
        });
        return;
    }

    response.status(201).json({ id });
});

app.patch("/products/:id", authenticate, authorizeRole(["seller"]), async (request, response) => {
    const id = z.string().min(1).parse(request.params.id);
    const product = db.products.get(id);
    if (!product || product.sellerId !== request.authUserId) {
        response.status(404).json({ error: "Not found" });
        return;
    }
    const schema = z.object({
        title: z.string().min(2).optional(),
        description: z.string().min(3).optional(),
        basePrice: z.number().positive().optional(),
        model3dUrl: z.union([z.string().url(), z.literal("")]).optional(),
        madeToOrder: z.boolean().optional(),
        stockQuantity: z.number().int().min(0).optional(),
        isFeatured: z.boolean().optional(),
        videoUrl: z.union([z.string().url(), z.literal("")]).optional().nullable(),
        dimensionChoices: z.array(z.string()).optional(),
        colorChoices: z.array(z.string()).optional(),
        imageUrls: z.array(z.string().url()).max(5).optional()
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
        response.status(400).json({ error: parsed.error.flatten() });
        return;
    }

    const nextMadeToOrder = parsed.data.madeToOrder ?? product.madeToOrder;
    if (
        !nextMadeToOrder &&
        product.stockQuantity === undefined &&
        parsed.data.stockQuantity === undefined
    ) {
        response.status(400).json({
            error: { formErrors: [], fieldErrors: { stockQuantity: ["Required when not made to order"] } }
        });
        return;
    }

    product.title = parsed.data.title ?? product.title;
    product.description = parsed.data.description ?? product.description;
    product.basePrice = parsed.data.basePrice ?? product.basePrice;
    if (parsed.data.model3dUrl !== undefined) {
        if (parsed.data.model3dUrl.length > 0) {
            product.model3dUrl = parsed.data.model3dUrl;
        } else {
            delete product.model3dUrl;
        }
    }
    if (parsed.data.madeToOrder !== undefined) {
        product.madeToOrder = parsed.data.madeToOrder;
    }
    if (parsed.data.isFeatured !== undefined) {
        product.isFeatured = parsed.data.isFeatured;
    }
    if (parsed.data.videoUrl !== undefined) {
        if (parsed.data.videoUrl && parsed.data.videoUrl.length > 0) {
            product.videoUrl = parsed.data.videoUrl;
        } else {
            delete product.videoUrl;
        }
    }

    if (nextMadeToOrder) {
        delete product.stockQuantity;
    } else if (parsed.data.stockQuantity !== undefined) {
        product.stockQuantity = parsed.data.stockQuantity;
    }

    if (parsed.data.dimensionChoices !== undefined || parsed.data.colorChoices !== undefined) {
        const opts = [...db.customizationOptions.values()].filter((o) => o.productId === id);
        const dimOpt = opts.find((o) => o.name === PRODUCT_DIMENSIONS_OPTION_NAME);
        const colOpt = opts.find((o) => o.name === PRODUCT_COLORS_OPTION_NAME);
        const dims = parsed.data.dimensionChoices ?? dimOpt?.values ?? [];
        const cols = parsed.data.colorChoices ?? colOpt?.values ?? [];
        try {
            await syncProductDimensionAndColorOptions(id, dims, cols);
        } catch (err) {
            response.status(500).json({
                error: err instanceof Error ? err.message : "Failed to save dimension/color options"
            });
            return;
        }
    }

    if (parsed.data.imageUrls !== undefined) {
        const staleMedia = [...db.productMedia.values()].filter((m) => m.productId === id);
        for (const media of staleMedia) {
            try {
                await deleteProductMedia(media.id);
            } catch (err) {
                response.status(500).json({
                    error: err instanceof Error ? err.message : "Failed to remove existing product images"
                });
                return;
            }
            db.productMedia.delete(media.id);
        }
        for (const url of parsed.data.imageUrls) {
            const mediaId = `pm-${randomUUID()}`;
            const media = { id: mediaId, productId: id, url };
            db.productMedia.set(mediaId, media);
            try {
                await persistProductMedia(media);
            } catch (err) {
                response.status(500).json({
                    error: err instanceof Error ? err.message : "Failed to save product images"
                });
                return;
            }
        }
    }

    try {
        await persistProduct(product);
    } catch (err) {
        response.status(500).json({
            error: err instanceof Error ? err.message : "Failed to save product"
        });
        return;
    }
    response.json({ ok: true, data: rewriteProductRecordForClient(product) });
});

app.post("/products/:id/publish", authenticate, authorizeRole(["seller"]), async (request, response) => {
    const id = z.string().min(1).parse(request.params.id);
    const product = db.products.get(id);
    if (!product || product.sellerId !== request.authUserId) {
        response.status(404).json({ error: "Not found" });
        return;
    }

    const verificationStatus = db.sellerStatus.get(request.authUserId as string);
    if (verificationStatus !== "approved") {
        response.status(403).json({ error: "Seller is not verified to publish" });
        return;
    }

    product.isPublished = true;
    try {
        await persistProduct(product);
    } catch (err) {
        product.isPublished = false;
        response.status(500).json({
            error: err instanceof Error ? err.message : "Failed to save product"
        });
        return;
    }
    response.json({ ok: true });
});

app.post(
    "/products/:id/unpublish",
    authenticate,
    authorizeRole(["seller"]),
    async (request, response) => {
        const id = z.string().min(1).parse(request.params.id);
        const product = db.products.get(id);
        if (!product || product.sellerId !== request.authUserId) {
            response.status(404).json({ error: "Not found" });
            return;
        }
        product.isPublished = false;
        try {
            await persistProduct(product);
        } catch (err) {
            product.isPublished = true;
            response.status(500).json({
                error: err instanceof Error ? err.message : "Failed to save product"
            });
            return;
        }
        response.json({ ok: true });
    }
);

app.get("/products", searchLimiter, (request, response) => {
    const rawSeller = request.query.seller;
    const sellerFilter =
        typeof rawSeller === "string" && rawSeller.length > 0 ? rawSeller : undefined;
    let rows = [...db.products.values()].filter((row) => row.isPublished);
    if (sellerFilter) {
        rows = rows.filter((p) => p.sellerId === sellerFilter);
    }
    const data = rows.map((p) => ({
        ...rewriteProductRecordForClient(p),
        thumbnailUrl: firstProductThumbnailUrl(p.id)
    }));
    response.json({ data });
});

app.get("/products/:id", (_request, response) => {
    const id = z.string().min(1).parse(_request.params.id);
    const product = db.products.get(id);
    if (!product) {
        response.status(404).json({ error: "Not found" });
        return;
    }
    const media = [...db.productMedia.values()].filter((entry) => entry.productId === id);
    const options = [...db.customizationOptions.values()].filter((entry) => entry.productId === id);
    const rules = [...db.customizationRules.values()].filter((entry) => entry.productId === id);
    const reviewSummary = productReviewSummaryForProduct(id);
    response.json({
        data: {
            ...rewriteProductRecordForClient(product),
            media: rewriteProductMediaForClient(media),
            options,
            rules,
            reviewSummary
        }
    });
});

app.get("/products/:id/reviews", (request, response) => {
    const productId = z.string().min(1).parse(request.params.id);
    const product = db.products.get(productId);
    if (!product || !product.isPublished) {
        response.status(404).json({ error: "Not found" });
        return;
    }
    const rows = [...db.productReviews.values()]
        .filter((r) => r.productId === productId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((r) => ({
            id: r.id,
            productId: r.productId,
            buyerId: r.buyerId,
            rating: r.rating,
            body: r.body,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
            authorLabel: reviewerDisplayLabel(r.buyerId)
        }));
    response.json({ data: rows });
});

app.get(
    "/products/:id/review-eligibility",
    authenticate,
    authorizeRole(["buyer"]),
    (request, response) => {
        const productId = z.string().min(1).parse(request.params.id);
        const product = db.products.get(productId);
        if (!product || !product.isPublished) {
            response.status(404).json({ error: "Not found" });
            return;
        }
        const buyerId = request.authUserId as string;
        const { hasCompletedPurchase, eligible, cooldownEndsAt } = getReviewEligibilityForBuyer(
            buyerId,
            productId
        );
        response.json({ data: { hasCompletedPurchase, eligible, cooldownEndsAt } });
    }
);

app.post("/products/:id/reviews", authenticate, authorizeRole(["buyer"]), async (request, response) => {
    const productId = z.string().min(1).parse(request.params.id);
    const product = db.products.get(productId);
    if (!product || !product.isPublished) {
        response.status(404).json({ error: "Product not found" });
        return;
    }
    const schema = z.object({
        rating: z.number().int().min(1).max(5),
        body: z.string().max(2000).optional().default("")
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
        response.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    const buyerId = request.authUserId as string;
    const { hasCompletedPurchase, eligible, cooldownEndsAt } = getReviewEligibilityForBuyer(
        buyerId,
        productId
    );
    if (!hasCompletedPurchase) {
        response.status(403).json({
            error: "Reviews are available only after this product is delivered from a completed order."
        });
        return;
    }
    if (!eligible) {
        response.status(429).json({
            error: "You can post or update a review for this product once every 30 days.",
            ...(cooldownEndsAt ? { cooldownEndsAt } : {})
        });
        return;
    }
    const existing = [...db.productReviews.values()].find(
        (r) => r.productId === productId && r.buyerId === buyerId
    );
    const now = new Date().toISOString();
    const review = existing
        ? {
              ...existing,
              rating: parsed.data.rating,
              body: parsed.data.body,
              updatedAt: now
          }
        : {
              id: `pr-${randomUUID()}`,
              productId,
              buyerId,
              rating: parsed.data.rating,
              body: parsed.data.body,
              createdAt: now,
              updatedAt: now
          };
    db.productReviews.set(review.id, review);
    try {
        await persistProductReview(review);
    } catch (error) {
        db.productReviews.delete(review.id);
        response.status(500).json({
            error: error instanceof Error ? error.message : "Failed to save review"
        });
        return;
    }
    response.status(existing ? 200 : 201).json({
        data: {
            ...review,
            authorLabel: reviewerDisplayLabel(buyerId)
        }
    });
});

app.delete("/products/:id", authenticate, authorizeRole(["seller"]), async (request, response) => {
    const id = z.string().min(1).parse(request.params.id);
    const product = db.products.get(id);
    if (!product || product.sellerId !== request.authUserId) {
        response.status(404).json({ error: "Not found" });
        return;
    }
    try {
        await deleteProductMediaByProduct(id);
    } catch (err) {
        response.status(500).json({
            error: err instanceof Error ? err.message : "Failed to delete product media"
        });
        return;
    }
    db.products.delete(id);
    for (const media of [...db.productMedia.values()]) {
        if (media.productId === id) {
            db.productMedia.delete(media.id);
        }
    }
    for (const option of [...db.customizationOptions.values()]) {
        if (option.productId === id) {
            db.customizationOptions.delete(option.id);
        }
    }
    for (const rule of [...db.customizationRules.values()]) {
        if (rule.productId === id) {
            db.customizationRules.delete(rule.id);
        }
    }
    for (const [rid, rev] of [...db.productReviews.entries()]) {
        if (rev.productId === id) {
            db.productReviews.delete(rid);
        }
    }
    deleteCustomizationOptionsByProduct(id);
    deleteCustomizationRulesByProduct(id);
    deleteProduct(id);
    response.json({ ok: true });
});

app.post("/products/:id/media", authenticate, authorizeRole(["seller"]), async (request, response) => {
    const productId = z.string().min(1).parse(request.params.id);
    const product = db.products.get(productId);
    if (!product || product.sellerId !== request.authUserId) {
        response.status(404).json({ error: "Not found" });
        return;
    }
    const imageCount = [...db.productMedia.values()].filter((m) => m.productId === productId).length;
    if (imageCount >= 5) {
        response.status(400).json({ error: "Maximum of 5 images per product" });
        return;
    }
    const schema = z.object({ url: z.string().url() });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
        response.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    const id = `pm-${randomUUID()}`;
    const media = { id, productId, url: parsed.data.url };
    db.productMedia.set(id, media);
    try {
        await persistProductMedia(media);
    } catch (err) {
        db.productMedia.delete(id);
        response.status(500).json({
            error: err instanceof Error ? err.message : "Failed to save product image"
        });
        return;
    }
    response.status(201).json({ id });
});

app.post("/products/:id/media/upload-url", authenticate, authorizeRole(["seller"]), async (request, response) => {
    const productId = z.string().min(1).parse(request.params.id);
    const product = db.products.get(productId);
    if (!product || product.sellerId !== request.authUserId) {
        response.status(404).json({ error: "Not found" });
        return;
    }
    const schema = z.object({
        filename: z.string().min(3).max(255),
        assetKind: z.enum(["image", "video"])
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
        response.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    if (parsed.data.assetKind === "image") {
        const imageCount = [...db.productMedia.values()].filter((m) => m.productId === productId).length;
        if (imageCount >= 5) {
            response.status(400).json({ error: "Maximum of 5 images per product" });
            return;
        }
    } else if (product.videoUrl) {
        response.status(400).json({ error: "A video is already set; clear video URL first" });
        return;
    }
    const kind = parsed.data.assetKind === "image" ? "product-image" : "product-video";
    const target = await generateVerificationUploadTarget(
        request.authUserId as string,
        parsed.data.filename,
        kind,
        productId
    );
    response.status(201).json(target);
});

app.post(
    "/products/:id/model-3d/upload-url",
    authenticate,
    authorizeRole(["seller"]),
    async (request, response) => {
        const productId = z.string().min(1).parse(request.params.id);
        const product = db.products.get(productId);
        if (!product || product.sellerId !== request.authUserId) {
            response.status(404).json({ error: "Not found" });
            return;
        }
        const schema = z.object({
            filename: z.string().min(3).max(255).optional()
        });
        const parsed = schema.safeParse(request.body);
        if (!parsed.success) {
            response.status(400).json({ error: parsed.error.flatten() });
            return;
        }
        const name = parsed.data.filename?.toLowerCase().endsWith(".glb")
            ? parsed.data.filename
            : `${parsed.data.filename ?? "model"}.glb`;
        const target = await generateVerificationUploadTarget(
            request.authUserId as string,
            name,
            "product-3d-model",
            productId
        );
        response.status(201).json(target);
    }
);

app.delete(
    "/products/:id/media/:mediaId",
    authenticate,
    authorizeRole(["seller"]),
    async (request, response) => {
        const productId = z.string().min(1).parse(request.params.id);
        const mediaId = z.string().min(1).parse(request.params.mediaId);
        const product = db.products.get(productId);
        const media = db.productMedia.get(mediaId);
        if (
            !product ||
            !media ||
            product.sellerId !== request.authUserId ||
            media.productId !== productId
        ) {
            response.status(404).json({ error: "Not found" });
            return;
        }
        try {
            await deleteProductMedia(mediaId);
        } catch (err) {
            response.status(500).json({
                error: err instanceof Error ? err.message : "Failed to delete media"
            });
            return;
        }
        db.productMedia.delete(mediaId);
        response.json({ ok: true });
    }
);

app.post(
    "/products/:id/customization-options",
    authenticate,
    authorizeRole(["seller"]),
    async (request, response) => {
        const productId = z.string().min(1).parse(request.params.id);
        const product = db.products.get(productId);
        if (!product || product.sellerId !== request.authUserId) {
            response.status(404).json({ error: "Not found" });
            return;
        }
        const schema = z.object({
            name: z.string().min(1),
            values: z.array(z.string().min(1)).min(1)
        });
        const parsed = schema.safeParse(request.body);
        if (!parsed.success) {
            response.status(400).json({ error: parsed.error.flatten() });
            return;
        }
        const id = `co-${Date.now()}`;
        const option = { id, productId, name: parsed.data.name, values: parsed.data.values };
        db.customizationOptions.set(id, option);
        try {
            await persistCustomizationOption(option);
        } catch (err) {
            db.customizationOptions.delete(id);
            response.status(500).json({
                error: err instanceof Error ? err.message : "Failed to save customization option"
            });
            return;
        }
        response.status(201).json({ id });
    }
);

app.patch(
    "/products/:id/customization-options/:optionId",
    authenticate,
    authorizeRole(["seller"]),
    async (request, response) => {
        const productId = z.string().min(1).parse(request.params.id);
        const optionId = z.string().min(1).parse(request.params.optionId);
        const option = db.customizationOptions.get(optionId);
        if (!option || option.productId !== productId) {
            response.status(404).json({ error: "Not found" });
            return;
        }
        const schema = z.object({
            name: z.string().min(1).optional(),
            values: z.array(z.string().min(1)).min(1).optional()
        });
        const parsed = schema.safeParse(request.body);
        if (!parsed.success) {
            response.status(400).json({ error: parsed.error.flatten() });
            return;
        }
        const prevName = option.name;
        const prevValues = [...option.values];
        option.name = parsed.data.name ?? option.name;
        option.values = parsed.data.values ?? option.values;
        try {
            await persistCustomizationOption(option);
        } catch (err) {
            option.name = prevName;
            option.values = prevValues;
            response.status(500).json({
                error: err instanceof Error ? err.message : "Failed to save customization option"
            });
            return;
        }
        response.json({ ok: true, data: option });
    }
);

app.post(
    "/products/:id/customization-rules",
    authenticate,
    authorizeRole(["seller"]),
    (request, response) => {
        const productId = z.string().min(1).parse(request.params.id);
        const product = db.products.get(productId);
        if (!product || product.sellerId !== request.authUserId) {
            response.status(404).json({ error: "Not found" });
            return;
        }
        const schema = z.object({ label: z.string().min(1), amount: z.number() });
        const parsed = schema.safeParse(request.body);
        if (!parsed.success) {
            response.status(400).json({ error: parsed.error.flatten() });
            return;
        }
        const id = `cr-${Date.now()}`;
        const rule = {
            id,
            productId,
            label: parsed.data.label,
            amount: parsed.data.amount
        };
        db.customizationRules.set(id, rule);
        persistCustomizationRule(rule);
        response.status(201).json({ id });
    }
);

app.post("/products/:id/price-preview", (request, response) => {
    const schema = z.object({
        multiplier: z.number().min(0.1).max(10).default(1),
        addOn: z.number().min(0).default(0)
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
        response.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    const product = db.products.get(request.params.id);
    if (!product) {
        response.status(404).json({ error: "Not found" });
        return;
    }
    const total = product.basePrice * parsed.data.multiplier + parsed.data.addOn;
    response.json({ basePrice: product.basePrice, total });
});

app.get("/cart", async (request, response) => {
    const authUserId = await resolveOptionalAuthUserId(request);
    const guestSessionId = getGuestSessionId(request);
    if (authUserId) {
        const user = db.users.get(authUserId);
        if (!user || user.role !== "buyer") {
            response.json({ data: [] });
            return;
        }
        try {
            await mergeGuestCartIntoBuyer(authUserId, guestSessionId);
        } catch (error) {
            console.error("[GET /cart] merge guest cart", error);
            response.status(500).json({ error: "Could not load cart" });
            return;
        }
        const items = [...db.cartItems.values()].filter((entry) => entry.buyerId === authUserId);
        response.json({ data: items });
        return;
    }

    if (!guestSessionId) {
        response.json({ data: [] });
        return;
    }

    const items = [...db.cartItems.values()].filter(
        (entry) => entry.guestSessionId === guestSessionId
    );
    response.json({ data: items });
});

app.post("/cart/items", async (request, response) => {
    const schema = z.object({
        productId: z.string().min(1),
        quantity: z.number().int().positive(),
        selections: z
            .array(z.object({ optionId: z.string().min(1), value: z.string().min(1) }))
            .optional()
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
        response.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    const product = db.products.get(parsed.data.productId);
    if (!product) {
        response.status(404).json({ error: "Product not found" });
        return;
    }
    const selectionResult = parseAndValidateCartSelections(
        parsed.data.productId,
        parsed.data.selections
    );
    if (!selectionResult.ok) {
        response.status(400).json({ error: selectionResult.error });
        return;
    }
    const authUserId = await resolveOptionalAuthUserId(request);
    const guestSessionId = getGuestSessionId(request);

    let createdId: string | null = null;
    try {
        if (authUserId) {
            const user = db.users.get(authUserId);
            if (!user || user.role !== "buyer") {
                response.status(403).json({ error: "Only shoppers can add items to the cart" });
                return;
            }
            await mergeGuestCartIntoBuyer(authUserId, guestSessionId);
        } else if (!guestSessionId) {
            response
                .status(400)
                .json({ error: "Guest session id is required for guest cart operations" });
            return;
        }

        const ownerLines = ownerCartItems(db.cartItems.values(), authUserId, guestSessionId);
        const pid = parsed.data.productId;
        const addQty = parsed.data.quantity;
        const maxUnits = maxPurchasableUnits(product);
        const totalForProduct = totalQuantityForProduct(ownerLines, pid);
        if (maxUnits !== null && totalForProduct + addQty > maxUnits) {
            response.status(400).json({
                error: `Only ${maxUnits} unit(s) available for this listing. You already have ${totalForProduct} in your cart.`
            });
            return;
        }

        const existing = ownerLines.find(
            (line) =>
                line.productId === pid &&
                cartSelectionsEqual(
                    Array.isArray(line.selections) ? line.selections : [],
                    selectionResult.selections
                )
        );

        if (existing) {
            if (!Array.isArray(existing.selections)) {
                existing.selections = [];
            }
            existing.quantity += addQty;
            await persistCartItem(existing);
            response.status(200).json({ id: existing.id });
            return;
        }

        createdId = `ci-${Date.now()}`;
        const cartItem = {
            id: createdId,
            ...(authUserId ? { buyerId: authUserId } : {}),
            ...(!authUserId && guestSessionId ? { guestSessionId } : {}),
            productId: pid,
            quantity: addQty,
            selections: selectionResult.selections
        };
        db.cartItems.set(createdId, cartItem);
        await persistCartItem(cartItem);
        response.status(201).json({ id: createdId });
    } catch (error) {
        if (createdId) {
            db.cartItems.delete(createdId);
        }
        console.error("[POST /cart/items]", error);
        response.status(500).json({ error: "Could not save cart item. Try again." });
    }
});

app.patch("/cart/items/:itemId", async (request, response) => {
    const itemId = z.string().min(1).parse(request.params.itemId);
    const authUserId = await resolveOptionalAuthUserId(request);
    const guestSessionId = getGuestSessionId(request);
    const authedBuyer = authUserId ? db.users.get(authUserId) : undefined;
    if (authUserId && authedBuyer?.role === "buyer") {
        try {
            await mergeGuestCartIntoBuyer(authUserId, guestSessionId);
        } catch (error) {
            console.error("[PATCH /cart/items] merge", error);
            response.status(500).json({ error: "Could not update cart" });
            return;
        }
    }
    const cartItem = db.cartItems.get(itemId);
    const isOwner = authUserId
        ? cartItem?.buyerId === authUserId
        : cartItem?.guestSessionId === guestSessionId;
    if (!cartItem || !isOwner) {
        response.status(404).json({ error: "Not found" });
        return;
    }
    const schema = z.object({ quantity: z.coerce.number().int().positive() });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
        response.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    const productForLine = db.products.get(cartItem.productId);
    if (!productForLine) {
        response.status(404).json({ error: "Product not found" });
        return;
    }
    const maxUnits = maxPurchasableUnits(productForLine);
    if (maxUnits !== null) {
        const ownerLines = ownerCartItems(db.cartItems.values(), authUserId, guestSessionId);
        const totalOthers = ownerLines
            .filter((line) => line.id !== cartItem.id && line.productId === cartItem.productId)
            .reduce((sum, line) => sum + line.quantity, 0);
        if (totalOthers + parsed.data.quantity > maxUnits) {
            response.status(400).json({
                error: `Only ${maxUnits} unit(s) available for this listing across your cart lines.`
            });
            return;
        }
    }
    cartItem.quantity = parsed.data.quantity;
    if (!Array.isArray(cartItem.selections)) {
        cartItem.selections = [];
    }
    try {
        await persistCartItem(cartItem);
    } catch (error) {
        console.error("[PATCH /cart/items] persist", error);
        response.status(500).json({ error: "Could not update cart" });
        return;
    }
    response.json({ ok: true, data: cartItem });
});

app.delete("/cart/items/:itemId", async (request, response) => {
    const itemId = z.string().min(1).parse(request.params.itemId);
    const authUserId = await resolveOptionalAuthUserId(request);
    const guestSessionId = getGuestSessionId(request);
    const authedBuyer = authUserId ? db.users.get(authUserId) : undefined;
    if (authUserId && authedBuyer?.role === "buyer") {
        try {
            await mergeGuestCartIntoBuyer(authUserId, guestSessionId);
        } catch (error) {
            console.error("[DELETE /cart/items] merge", error);
            response.status(500).json({ error: "Could not update cart" });
            return;
        }
    }
    const cartItem = db.cartItems.get(itemId);
    const isOwner = authUserId
        ? cartItem?.buyerId === authUserId
        : cartItem?.guestSessionId === guestSessionId;
    if (!cartItem || !isOwner) {
        response.status(404).json({ error: "Not found" });
        return;
    }
    db.cartItems.delete(itemId);
    try {
        await deleteCartItem(itemId);
    } catch (error) {
        console.error("[DELETE /cart/items]", error);
        db.cartItems.set(itemId, cartItem);
        response.status(500).json({ error: "Could not remove cart item" });
        return;
    }
    response.json({ ok: true });
});

app.post(
    "/checkout",
    authenticate,
    authorizeRole(["buyer"]),
    async (request, response): Promise<void> => {
    const onlinePaymentEntry = z.object({
        sellerId: z.string().min(1),
        sellerPaymentMethodId: z.string().min(1),
        receiptProofUrl: z.string().url()
    });
    const schema = z.object({
        paymentMethod: z.enum(["cash", "online"]),
        paymentReference: z.string().max(500).optional(),
        onlinePayments: z.array(onlinePaymentEntry).optional(),
        estimatedDeliveryStartAt: z.string().optional(),
        estimatedDeliveryEndAt: z.string().optional(),
        estimatedDeliveryRangeDisplay: z.string().max(220).optional(),
        shippingRecipientName: z.string().max(120).optional(),
        shippingContactNumber: z.string().max(40).optional(),
        shippingAddressLine: z.string().max(255).optional(),
        shippingCity: z.string().max(120).optional(),
        shippingPostalCode: z.string().max(20).optional(),
        deliveryNotes: z.string().max(2000).optional()
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
        response.status(400).json({ error: parsed.error.flatten() });
        return;
    }

    const buyerId = request.authUserId as string;
    const guestSessionId = getGuestSessionId(request);
    try {
        await mergeGuestCartIntoBuyer(buyerId, guestSessionId);
    } catch (error) {
        console.error("[POST /checkout] merge guest cart", error);
        response.status(500).json({ error: "Could not prepare checkout" });
        return;
    }

    const items = [...db.cartItems.values()].filter((entry) => entry.buyerId === buyerId);
    if (items.length === 0) {
        response.status(400).json({ error: "Cart is empty" });
        return;
    }

    const products = items
        .map((item) => db.products.get(item.productId))
        .filter((product): product is NonNullable<typeof product> => Boolean(product));
    if (products.length !== items.length) {
        response.status(400).json({ error: "One or more cart items are invalid" });
        return;
    }

    const groups = new Map<string, typeof items>();
    for (const item of items) {
        const product = db.products.get(item.productId);
        if (!product) {
            continue;
        }
        const list = groups.get(product.sellerId) ?? [];
        list.push(item);
        groups.set(product.sellerId, list);
    }
    const sellerIds = [...groups.keys()];
    if (sellerIds.length === 0) {
        response.status(400).json({ error: "Unable to resolve seller for checkout" });
        return;
    }

    if (parsed.data.paymentMethod === "online") {
        const ops = parsed.data.onlinePayments ?? [];
        if (ops.length !== sellerIds.length) {
            response
                .status(400)
                .json({ error: "Provide exactly one online payment entry per seller in your cart" });
            return;
        }
        const seenSeller = new Set<string>();
        for (const op of ops) {
            if (!sellerIds.includes(op.sellerId)) {
                response.status(400).json({ error: "Unknown seller in online payment data" });
                return;
            }
            if (seenSeller.has(op.sellerId)) {
                response.status(400).json({ error: "Duplicate seller in online payment data" });
                return;
            }
            seenSeller.add(op.sellerId);
            const method = db.sellerPaymentMethods.get(op.sellerPaymentMethodId);
            if (!method || method.sellerId !== op.sellerId) {
                response.status(400).json({ error: "Invalid payment method for seller" });
                return;
            }
        }
        for (const sid of sellerIds) {
            if (!seenSeller.has(sid)) {
                response.status(400).json({ error: "Missing online payment for a seller" });
                return;
            }
        }
    }

    const qtyByProduct = new Map<string, number>();
    for (const item of items) {
        qtyByProduct.set(item.productId, (qtyByProduct.get(item.productId) ?? 0) + item.quantity);
    }
    for (const [productId, qty] of qtyByProduct) {
        const p = db.products.get(productId);
        if (!p || p.madeToOrder) {
            continue;
        }
        const stock = p.stockQuantity ?? 0;
        if (stock < qty) {
            response.status(400).json({
                error: `Insufficient stock for "${p.title}". Available: ${stock}, requested: ${qty}.`
            });
            return;
        }
    }

    try {
        const baseTime = Date.now();
        const createdOrders: Array<{ id: string; sellerId: string; totalAmount: number }> = [];
        let orderIndex = 0;

        const shippingBody: CheckoutShippingBody = {};
        if (parsed.data.shippingRecipientName) {
            shippingBody.shippingRecipientName = parsed.data.shippingRecipientName;
        }
        if (parsed.data.shippingContactNumber) {
            shippingBody.shippingContactNumber = parsed.data.shippingContactNumber;
        }
        if (parsed.data.shippingAddressLine) {
            shippingBody.shippingAddressLine = parsed.data.shippingAddressLine;
        }
        if (parsed.data.shippingCity) {
            shippingBody.shippingCity = parsed.data.shippingCity;
        }
        if (parsed.data.shippingPostalCode) {
            shippingBody.shippingPostalCode = parsed.data.shippingPostalCode;
        }
        if (parsed.data.deliveryNotes) {
            shippingBody.deliveryNotes = parsed.data.deliveryNotes;
        }
        const shippingSnapshot = checkoutShippingSnapshotFromBody(shippingBody);

        for (const sellerId of sellerIds) {
            const groupItems = groups.get(sellerId);
            if (!groupItems?.length) {
                continue;
            }
            const totalAmount = groupItems.reduce((sum, item) => {
                const product = db.products.get(item.productId);
                return sum + (product?.basePrice ?? 0) * item.quantity;
            }, 0);

            const op =
                parsed.data.paymentMethod === "online"
                    ? parsed.data.onlinePayments!.find((o) => o.sellerId === sellerId)
                    : undefined;
            const method = op ? db.sellerPaymentMethods.get(op.sellerPaymentMethodId) : undefined;
            const paymentReference =
                parsed.data.paymentMethod === "online" && method
                    ? `${method.methodName} · ${method.accountName}`
                    : parsed.data.paymentReference;

            const id = `o-${baseTime}-${orderIndex}`;
            orderIndex += 1;

            const createdAt = new Date().toISOString();
            const deliveryInput: EstimatedDeliveryInput = {};
            if (parsed.data.estimatedDeliveryStartAt) {
                deliveryInput.estimatedDeliveryStartAt = parsed.data.estimatedDeliveryStartAt;
            }
            if (parsed.data.estimatedDeliveryEndAt) {
                deliveryInput.estimatedDeliveryEndAt = parsed.data.estimatedDeliveryEndAt;
            }
            if (parsed.data.estimatedDeliveryRangeDisplay) {
                deliveryInput.estimatedDeliveryRangeDisplay = parsed.data.estimatedDeliveryRangeDisplay;
            }
            const delivery = resolveEstimatedDeliveryForOrder(createdAt, deliveryInput);

            const order = {
                id,
                buyerId,
                sellerId,
                status: "created" as const,
                paymentMethod: parsed.data.paymentMethod,
                ...(paymentReference ? { paymentReference } : {}),
                paymentStatus: "pending" as const,
                receiptStatus:
                    parsed.data.paymentMethod === "online" ? ("submitted" as const) : ("none" as const),
                totalAmount,
                createdAt,
                estimatedDeliveryStartAt: delivery.estimatedDeliveryStartAt,
                estimatedDeliveryEndAt: delivery.estimatedDeliveryEndAt,
                estimatedDeliveryRangeDisplay: delivery.estimatedDeliveryRangeDisplay,
                ...shippingSnapshot,
                ...(op?.receiptProofUrl ? { receiptProofUrl: op.receiptProofUrl } : {}),
                ...(op?.sellerPaymentMethodId ? { sellerPaymentMethodId: op.sellerPaymentMethodId } : {})
            };

            db.orders.set(id, order);
            await persistOrder(order);
            emitOrderUpdated(order);

            const orderCreatedAt = order.createdAt;
            for (const entry of groupItems) {
                const lineId = `oli-${randomUUID()}`;
                const rawSelections = Array.isArray(entry.selections) ? entry.selections : [];
                const lineItem: OrderLineItemRecord = {
                    id: lineId,
                    orderId: id,
                    productId: entry.productId,
                    quantity: entry.quantity,
                    createdAt: orderCreatedAt,
                    selections: snapshotSelectionsForOrderLine(entry.productId, rawSelections)
                };
                db.orderLineItems.set(lineId, lineItem);
                await persistOrderLineItem(lineItem);
            }

            createdOrders.push({ id, sellerId, totalAmount });
        }

        for (const [productId, qty] of qtyByProduct) {
            const p = db.products.get(productId);
            if (!p || p.madeToOrder) {
                continue;
            }
            const nextStock = (p.stockQuantity ?? 0) - qty;
            const updated = { ...p, stockQuantity: nextStock };
            db.products.set(productId, updated);
            await persistProduct(updated);
        }

        for (const entry of items) {
            db.cartItems.delete(entry.id);
            try {
                await deleteCartItem(entry.id);
            } catch (error) {
                console.error("[POST /checkout] delete cart row", entry.id, error);
            }
        }

        response.status(201).json({ orders: createdOrders });
    } catch (error) {
        console.error("[POST /checkout]", error);
        response.status(500).json({
            error: error instanceof Error ? error.message : "Could not complete checkout"
        });
    }
    }
);

app.get("/orders", authenticate, (request, response) => {
    const user = db.users.get(request.authUserId as string);
    if (!user) {
        response.status(401).json({ error: "Unauthorized" });
        return;
    }
    const list =
        user.role === "admin"
            ? [...db.orders.values()]
            : user.role === "seller"
              ? [...db.orders.values()].filter((entry) => entry.sellerId === user.id)
              : [...db.orders.values()].filter((entry) => entry.buyerId === user.id);
    response.json({ data: list });
});

app.get("/orders/:id", authenticate, (request, response) => {
    const id = z.string().min(1).parse(request.params.id);
    const order = db.orders.get(id);
    const user = db.users.get(request.authUserId as string);
    if (!order || !user) {
        response.status(404).json({ error: "Not found" });
        return;
    }
    if (user.role !== "admin" && order.buyerId !== user.id && order.sellerId !== user.id) {
        response.status(403).json({ error: "Forbidden" });
        return;
    }
    const lineItems = [...db.orderLineItems.values()].filter((line) => line.orderId === id);
    let buyerDisplayName: string | undefined;
    if (user.role === "seller" || user.role === "admin") {
        const buyer = db.users.get(order.buyerId);
        const name = buyer?.fullName?.trim();
        buyerDisplayName = name || buyer?.email || order.buyerId;
    }
    response.json({
        data: {
            order,
            lineItems,
            ...(buyerDisplayName !== undefined ? { buyerDisplayName } : {})
        }
    });
});

app.get(
    "/orders/:id/payment-receipt-read-url",
    authenticate,
    async (request, response): Promise<void> => {
        const orderId = z.string().min(1).parse(request.params.id);
        const order = db.orders.get(orderId);
        const user = db.users.get(request.authUserId as string);
        if (!order || !user) {
            response.status(404).json({ error: "Not found" });
            return;
        }
        if (user.role !== "admin" && order.buyerId !== user.id && order.sellerId !== user.id) {
            response.status(403).json({ error: "Forbidden" });
            return;
        }
        if (!order.receiptProofUrl?.trim()) {
            response.status(404).json({ error: "No payment receipt for this order." });
            return;
        }
        const readUrl = await resolveVerificationDocsReadUrl(order.receiptProofUrl);
        if (!readUrl) {
            response.status(503).json({
                error: "Could not generate a view link for this receipt."
            });
            return;
        }
        response.json({ data: { readUrl } });
    }
);

app.get("/orders/:id/messages", authenticate, (request, response) => {
    const orderId = z.string().min(1).parse(request.params.id);
    const order = db.orders.get(orderId);
    const user = db.users.get(request.authUserId as string);
    if (!order || !user) {
        response.status(404).json({ error: "Order not found" });
        return;
    }
    if (user.role !== "admin" && order.buyerId !== user.id && order.sellerId !== user.id) {
        response.status(403).json({ error: "Forbidden" });
        return;
    }

    const messages = [...db.orderMessages.values()]
        .filter((message) => message.orderId === orderId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    response.json({ data: messages });
});

app.post(
    "/orders/:id/messages",
    authenticate,
    authorizeRole(["buyer", "seller"]),
    async (request, response): Promise<void> => {
        const orderId = z.string().min(1).parse(request.params.id);
        const schema = z.object({
            body: z.string().min(1).max(2000)
        });
        const parsed = schema.safeParse(request.body);
        if (!parsed.success) {
            response.status(400).json({ error: parsed.error.flatten() });
            return;
        }

        const order = db.orders.get(orderId);
        const user = db.users.get(request.authUserId as string);
        if (!order || !user) {
            response.status(404).json({ error: "Order not found" });
            return;
        }

        const isParticipant = order.buyerId === user.id || order.sellerId === user.id;
        if (!isParticipant) {
            response.status(403).json({ error: "Forbidden" });
            return;
        }

        const message = {
            id: `m-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            orderId,
            senderId: user.id,
            body: parsed.data.body,
            createdAt: new Date().toISOString()
        };
        db.orderMessages.set(message.id, message);
        try {
            await persistOrderMessage(message);
        } catch (error) {
            db.orderMessages.delete(message.id);
            console.error("[POST /orders/:id/messages] persistOrderMessage", error);
            response.status(500).json({
                error:
                    error instanceof Error
                        ? error.message
                        : "Could not save message. Check that the database is available."
            });
            return;
        }
        emitOrderMessage(message);
        response.status(201).json({ data: message });
    }
);

app.post(
    "/orders/:id/cancel-by-seller",
    authenticate,
    authorizeRole(["seller", "admin"]),
    async (request, response): Promise<void> => {
        const orderId = z.string().min(1).parse(request.params.id);
        const schema = z.object({
            reason: z
                .string()
                .min(10, "Please provide at least 10 characters.")
                .max(2000)
                .transform((s) => s.trim())
        });
        const parsed = schema.safeParse(request.body);
        if (!parsed.success) {
            response.status(400).json({ error: parsed.error.flatten() });
            return;
        }
        const order = db.orders.get(orderId);
        const actor = db.users.get(request.authUserId as string);
        if (!order || !actor) {
            response.status(404).json({ error: "Order not found" });
            return;
        }
        if (actor.role === "seller" && order.sellerId !== actor.id) {
            response.status(403).json({ error: "Forbidden" });
            return;
        }
        if (order.status === "delivered" || order.status === "cancelled") {
            response.status(400).json({ error: "This order cannot be cancelled." });
            return;
        }
        const previousStatus = order.status;
        const previousCancellationReason = order.cancellationReason;
        order.status = "cancelled";
        order.cancellationReason = parsed.data.reason;
        try {
            await persistOrder(order);
        } catch (error) {
            order.status = previousStatus;
            if (previousCancellationReason !== undefined) {
                order.cancellationReason = previousCancellationReason;
            } else {
                delete order.cancellationReason;
            }
            console.error("[POST /orders/:id/cancel-by-seller]", error);
            response.status(500).json({
                error: error instanceof Error ? error.message : "Could not cancel order"
            });
            return;
        }
        const message = {
            id: `m-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
            orderId,
            senderId: actor.id,
            body: `This order was cancelled.\n\nReason:\n${parsed.data.reason}`,
            createdAt: new Date().toISOString()
        };
        db.orderMessages.set(message.id, message);
        try {
            await persistOrderMessage(message);
        } catch (err) {
            console.error("[POST /orders/:id/cancel-by-seller] persistOrderMessage", err);
        }
        emitOrderMessage(message);
        emitOrderUpdated(order);
        response.json({ ok: true, status: order.status });
    }
);

app.post(
    "/orders/:id/cancel-by-buyer",
    authenticate,
    authorizeRole(["buyer", "admin"]),
    async (request, response): Promise<void> => {
        const orderId = z.string().min(1).parse(request.params.id);
        const schema = z.object({
            reason: z
                .string()
                .min(10, "Please provide at least 10 characters.")
                .max(2000)
                .transform((s) => s.trim())
        });
        const parsed = schema.safeParse(request.body);
        if (!parsed.success) {
            response.status(400).json({ error: parsed.error.flatten() });
            return;
        }
        const order = db.orders.get(orderId);
        const actor = db.users.get(request.authUserId as string);
        if (!order || !actor) {
            response.status(404).json({ error: "Order not found" });
            return;
        }
        if (actor.role === "buyer" && order.buyerId !== actor.id) {
            response.status(403).json({ error: "Forbidden" });
            return;
        }
        if (order.status === "delivered" || order.status === "cancelled") {
            response.status(400).json({ error: "This order cannot be cancelled." });
            return;
        }
        if (order.status === "shipped") {
            response.status(400).json({
                error: "This order is already on the way. Contact your seller if you need help."
            });
            return;
        }
        const previousStatus = order.status;
        const previousCancellationReason = order.cancellationReason;
        order.status = "cancelled";
        order.cancellationReason = parsed.data.reason;
        try {
            await persistOrder(order);
        } catch (error) {
            order.status = previousStatus;
            if (previousCancellationReason !== undefined) {
                order.cancellationReason = previousCancellationReason;
            } else {
                delete order.cancellationReason;
            }
            console.error("[POST /orders/:id/cancel-by-buyer]", error);
            response.status(500).json({
                error: error instanceof Error ? error.message : "Could not cancel order"
            });
            return;
        }
        const message = {
            id: `m-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
            orderId,
            senderId: actor.id,
            body: `I cancelled this order.\n\nReason:\n${parsed.data.reason}`,
            createdAt: new Date().toISOString()
        };
        db.orderMessages.set(message.id, message);
        try {
            await persistOrderMessage(message);
        } catch (err) {
            console.error("[POST /orders/:id/cancel-by-buyer] persistOrderMessage", err);
        }
        emitOrderMessage(message);
        emitOrderUpdated(order);
        response.json({ ok: true, status: order.status });
    }
);

app.get("/conversations", authenticate, authorizeRole(["buyer", "seller"]), (request, response) => {
    const userId = request.authUserId as string;
    const user = db.users.get(userId);
    if (!user) {
        response.status(401).json({ error: "Unauthorized" });
        return;
    }
    const threads = [...db.conversations.values()].filter((c) =>
        user.role === "buyer" ? c.buyerId === userId : c.sellerId === userId
    );
    const enriched = threads
        .map((c) => {
            const peerId = user.role === "buyer" ? c.sellerId : c.buyerId;
            const peer = db.users.get(peerId);
            const msgs = [...db.conversationMessages.values()]
                .filter((m) => m.conversationId === c.id)
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
            const last = msgs[0];
            return {
                id: c.id,
                buyerId: c.buyerId,
                sellerId: c.sellerId,
                updatedAt: c.updatedAt,
                peerId,
                peerEmail: peer?.email ?? "",
                lastMessagePreview: last?.body,
                lastMessageAt: last?.createdAt
            };
        })
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    response.json({ data: enriched });
});

app.post("/conversations", authenticate, authorizeRole(["buyer", "seller"]), async (request, response) => {
    const schema = z.object({
        sellerId: z.string().min(1).optional(),
        buyerId: z.string().min(1).optional()
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
        response.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    const me = db.users.get(request.authUserId as string);
    if (!me) {
        response.status(401).json({ error: "Unauthorized" });
        return;
    }
    let buyerId: string;
    let sellerId: string;
    if (me.role === "buyer") {
        if (!parsed.data.sellerId) {
            response.status(400).json({ error: "sellerId is required" });
            return;
        }
        buyerId = me.id;
        sellerId = parsed.data.sellerId;
    } else {
        if (!parsed.data.buyerId) {
            response.status(400).json({ error: "buyerId is required" });
            return;
        }
        buyerId = parsed.data.buyerId;
        sellerId = me.id;
    }
    if (buyerId === sellerId) {
        response.status(400).json({ error: "Invalid conversation" });
        return;
    }
    const sellerUser = db.users.get(sellerId);
    const buyerUser = db.users.get(buyerId);
    if (!sellerUser || sellerUser.role !== "seller" || !buyerUser || buyerUser.role !== "buyer") {
        response.status(400).json({ error: "Invalid buyer or seller" });
        return;
    }
    const existing = findDirectConversation(buyerId, sellerId);
    if (existing) {
        response.json({ data: { id: existing.id, buyerId, sellerId, updatedAt: existing.updatedAt } });
        return;
    }
    const id = `cv-${randomUUID()}`;
    const updatedAt = new Date().toISOString();
    const conv: ConversationRecord = { id, buyerId, sellerId, updatedAt };
    db.conversations.set(id, conv);
    try {
        await persistConversation(conv);
    } catch (error) {
        db.conversations.delete(id);
        response.status(500).json({
            error: error instanceof Error ? error.message : "Failed to create conversation"
        });
        return;
    }
    response.status(201).json({ data: { id, buyerId, sellerId, updatedAt } });
});

app.get("/conversations/:id/messages", authenticate, authorizeRole(["buyer", "seller"]), (request, response) => {
    const conversationId = z.string().min(1).parse(request.params.id);
    const conv = db.conversations.get(conversationId);
    const user = db.users.get(request.authUserId as string);
    if (!conv || !user) {
        response.status(404).json({ error: "Not found" });
        return;
    }
    if (conv.buyerId !== user.id && conv.sellerId !== user.id) {
        response.status(403).json({ error: "Forbidden" });
        return;
    }
    const messages = [...db.conversationMessages.values()]
        .filter((m) => m.conversationId === conversationId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    response.json({ data: messages });
});

app.post(
    "/conversations/:id/messages",
    authenticate,
    authorizeRole(["buyer", "seller"]),
    async (request, response) => {
        const conversationId = z.string().min(1).parse(request.params.id);
        const schema = z.object({
            body: z.string().min(1).max(2000)
        });
        const parsed = schema.safeParse(request.body);
        if (!parsed.success) {
            response.status(400).json({ error: parsed.error.flatten() });
            return;
        }
        const conv = db.conversations.get(conversationId);
        const user = db.users.get(request.authUserId as string);
        if (!conv || !user) {
            response.status(404).json({ error: "Not found" });
            return;
        }
        if (conv.buyerId !== user.id && conv.sellerId !== user.id) {
            response.status(403).json({ error: "Forbidden" });
            return;
        }
        const message = {
            id: `dm-${randomUUID()}`,
            conversationId,
            senderId: user.id,
            body: parsed.data.body,
            createdAt: new Date().toISOString()
        };
        const previousUpdatedAt = conv.updatedAt;
        db.conversationMessages.set(message.id, message);
        conv.updatedAt = message.createdAt;
        db.conversations.set(conversationId, conv);
        try {
            await persistConversationMessage(message);
            await persistConversation(conv);
        } catch (error) {
            db.conversationMessages.delete(message.id);
            conv.updatedAt = previousUpdatedAt;
            db.conversations.set(conversationId, conv);
            response.status(500).json({
                error: error instanceof Error ? error.message : "Failed to save message"
            });
            return;
        }
        emitDirectMessage(message);
        response.status(201).json({ data: message });
    }
);

app.post(
    "/orders/:id/status",
    authenticate,
    authorizeRole(["seller", "admin"]),
    async (request, response): Promise<void> => {
        const orderQualityChecklistItemSchema = z.object({
            id: z.string().min(1).max(120),
            label: z
                .string()
                .max(500)
                .transform((s) => s.trim())
                .refine((s) => s.length > 0, {
                    message: "Each checklist line needs text."
                }),
            checked: z.boolean()
        });
        const orderQualityChecklistSchema = z.object({
            items: z.array(orderQualityChecklistItemSchema).min(1).max(30)
        });
        const schema = z.object({
            status: z.enum(["confirmed", "processing", "shipped", "delivered"]),
            qualityChecklist: orderQualityChecklistSchema.optional()
        });
        const parsed = schema.safeParse(request.body);
        if (!parsed.success) {
            response.status(400).json({ error: parsed.error.flatten() });
            return;
        }
        const orderId = z.string().min(1).parse(request.params.id);
        const order = db.orders.get(orderId);
        if (!order) {
            response.status(404).json({ error: "Order not found" });
            return;
        }
        const actor = db.users.get(request.authUserId as string);
        if (actor?.role === "seller" && order.sellerId !== actor.id) {
            response.status(403).json({ error: "Forbidden" });
            return;
        }
        if (order.status === "cancelled") {
            response.status(400).json({ error: "Cannot change status of a cancelled order." });
            return;
        }
        if (
            parsed.data.qualityChecklist !== undefined &&
            !(order.status === "created" && parsed.data.status === "confirmed")
        ) {
            response.status(400).json({
                error: "qualityChecklist is only accepted when confirming a new order."
            });
            return;
        }
        const transitions: Record<string, string[]> = {
            created: ["confirmed"],
            confirmed: ["processing", "shipped"],
            processing: ["shipped"],
            shipped: ["delivered"],
            delivered: [],
            cancelled: []
        };
        const allowed = transitions[order.status] ?? [];
        if (!allowed.includes(parsed.data.status) && parsed.data.status !== order.status) {
            response.status(400).json({ error: "Invalid status transition" });
            return;
        }
        if (order.status === "created" && parsed.data.status === "confirmed") {
            const qc = parsed.data.qualityChecklist;
            if (!qc) {
                response.status(400).json({
                    error: "qualityChecklist is required when confirming an order."
                });
                return;
            }
            if (!qc.items.every((row) => row.checked)) {
                response.status(400).json({
                    error: "Complete every quality checklist item before confirming this order."
                });
                return;
            }
            order.qualityChecklist = qc;
        }
        order.status = parsed.data.status;
        try {
            await persistOrder(order);
        } catch (error) {
            console.error("[POST /orders/:id/status] persistOrder", error);
            response.status(500).json({ error: "Could not save order" });
            return;
        }
        emitOrderUpdated(order);
        response.json({ ok: true, status: order.status });
    }
);

app.post(
    "/orders/:id/payment-status",
    authenticate,
    authorizeRole(["seller", "admin"]),
    async (request, response): Promise<void> => {
        const schema = z.object({
            paymentStatus: z.enum(["pending", "paid"])
        });
        const parsed = schema.safeParse(request.body);
        if (!parsed.success) {
            response.status(400).json({ error: parsed.error.flatten() });
            return;
        }
        const orderId = z.string().min(1).parse(request.params.id);
        const order = db.orders.get(orderId);
        if (!order) {
            response.status(404).json({ error: "Order not found" });
            return;
        }
        const actor = db.users.get(request.authUserId as string);
        if (actor?.role === "seller" && order.sellerId !== actor.id) {
            response.status(403).json({ error: "Forbidden" });
            return;
        }
        if (order.status === "cancelled") {
            response.status(400).json({ error: "Cannot update payment on a cancelled order." });
            return;
        }
        if (order.paymentMethod === "cash" && parsed.data.paymentStatus === "pending") {
            response.status(400).json({ error: "Cash payments cannot be reverted to pending." });
            return;
        }
        order.paymentStatus = parsed.data.paymentStatus;
        if (order.paymentStatus === "paid") {
            order.receiptStatus =
                order.paymentMethod === "online" && order.paymentReference ? "approved" : "none";
            delete order.receiptRequestNote;
        }
        try {
            await persistOrder(order);
        } catch (error) {
            console.error("[POST /orders/:id/payment-status] persistOrder", error);
            response.status(500).json({ error: "Could not save order" });
            return;
        }
        emitOrderUpdated(order);
        response.json({ ok: true, paymentStatus: order.paymentStatus });
    }
);

app.post(
    "/orders/:id/request-receipt",
    authenticate,
    authorizeRole(["seller", "admin"]),
    async (request, response): Promise<void> => {
        const schema = z.object({
            note: z.string().min(5).max(500)
        });
        const parsed = schema.safeParse(request.body);
        if (!parsed.success) {
            response.status(400).json({ error: parsed.error.flatten() });
            return;
        }
        const orderId = z.string().min(1).parse(request.params.id);
        const order = db.orders.get(orderId);
        if (!order) {
            response.status(404).json({ error: "Order not found" });
            return;
        }
        const actor = db.users.get(request.authUserId as string);
        if (actor?.role === "seller" && order.sellerId !== actor.id) {
            response.status(403).json({ error: "Forbidden" });
            return;
        }
        if (order.paymentMethod !== "online") {
            response.status(400).json({ error: "Receipt request is only for online payments." });
            return;
        }
        if (order.status === "cancelled") {
            response.status(400).json({ error: "Cannot request receipt on a cancelled order." });
            return;
        }
        order.paymentStatus = "pending";
        order.receiptStatus = "resubmit_requested";
        order.receiptRequestNote = parsed.data.note;
        try {
            await persistOrder(order);
        } catch (error) {
            console.error("[POST /orders/:id/request-receipt] persistOrder", error);
            response.status(500).json({ error: "Could not save order" });
            return;
        }
        emitOrderUpdated(order);
        response.json({ ok: true, receiptStatus: order.receiptStatus });
    }
);

app.post(
    "/orders/:id/buyer-payment-receipt",
    authenticate,
    authorizeRole(["buyer"]),
    async (request, response): Promise<void> => {
        const schema = z.object({
            receiptProofUrl: z.string().url()
        });
        const parsed = schema.safeParse(request.body);
        if (!parsed.success) {
            response.status(400).json({ error: parsed.error.flatten() });
            return;
        }
        const orderId = z.string().min(1).parse(request.params.id);
        const order = db.orders.get(orderId);
        const user = db.users.get(request.authUserId as string);
        if (!order || !user) {
            response.status(404).json({ error: "Order not found" });
            return;
        }
        if (order.buyerId !== user.id) {
            response.status(403).json({ error: "Forbidden" });
            return;
        }
        if (order.paymentMethod !== "online") {
            response.status(400).json({ error: "This order does not use online payment." });
            return;
        }
        if (order.status === "cancelled") {
            response.status(400).json({ error: "Cannot update receipt on a cancelled order." });
            return;
        }
        if (order.receiptStatus !== "resubmit_requested") {
            response.status(400).json({
                error:
                    "The seller has not asked for a new receipt, or this order is not waiting for one."
            });
            return;
        }
        order.receiptProofUrl = parsed.data.receiptProofUrl;
        order.receiptStatus = "submitted";
        delete order.receiptRequestNote;
        try {
            await persistOrder(order);
        } catch (error) {
            console.error("[POST /orders/:id/buyer-payment-receipt] persistOrder", error);
            response.status(500).json({ error: "Could not save order" });
            return;
        }
        emitOrderUpdated(order);
        response.json({ ok: true, receiptStatus: order.receiptStatus });
    }
);

app.get("/admin/overview", authenticate, authorizeRole(["admin"]), (_request, response) => {
    const sellers = [...db.users.values()].filter((u) => u.role === "seller");
    let verifiedSellers = 0;
    for (const s of sellers) {
        if (db.sellerStatus.get(s.id) === "approved") {
            verifiedSellers += 1;
        }
    }
    const pendingVerifications = [...db.verifications.values()].filter((v) => v.status === "pending")
        .length;
    const pendingLocationRequests = [...db.sellerLocationRequests.values()].filter(
        (r) => r.status === "pending"
    ).length;
    response.json({
        data: {
            pendingVerifications,
            pendingLocationRequests,
            verifiedSellers,
            unverifiedSellers: sellers.length - verifiedSellers,
            totalSellers: sellers.length
        }
    });
});

app.get("/admin/location-requests", authenticate, authorizeRole(["admin"]), (request, response) => {
    const statusQ = request.query.status;
    const { page, limit } = parseListPagination(request.query);
    const rows = [...db.sellerLocationRequests.values()]
        .filter((entry) => (typeof statusQ === "string" ? entry.status === statusQ : true))
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
        .map((entry) => {
            const seller = db.users.get(entry.sellerId);
            const profile = db.sellerProfiles.get(entry.sellerId);
            return {
                ...entry,
                seller: seller
                    ? { id: seller.id, email: seller.email, fullName: seller.fullName }
                    : null,
                profile: profile
                    ? {
                          sellerId: profile.sellerId,
                          businessName: profile.businessName,
                          address: profile.address,
                          shopLatitude: profile.shopLatitude,
                          shopLongitude: profile.shopLongitude
                      }
                    : null
            };
        });
    const { data, pagination } = slicePaginated(rows, page, limit);
    response.json({ data, pagination });
});

app.post(
    "/admin/location-requests/:id/approve",
    authenticate,
    authorizeRole(["admin"]),
    async (request, response) => {
        const id = z.string().min(1).parse(request.params.id);
        const reqRow = db.sellerLocationRequests.get(id);
        if (!reqRow || reqRow.status !== "pending") {
            response.status(404).json({ error: "Pending request not found" });
            return;
        }
        const profile = db.sellerProfiles.get(reqRow.sellerId);
        if (!profile) {
            response.status(404).json({ error: "Seller profile not found" });
            return;
        }
        const previousLat = profile.shopLatitude;
        const previousLng = profile.shopLongitude;
        profile.shopLatitude = reqRow.requestedLatitude;
        profile.shopLongitude = reqRow.requestedLongitude;
        reqRow.status = "approved";
        reqRow.reviewedAt = new Date().toISOString();
        try {
            await persistSellerProfile(profile);
            await persistSellerLocationChangeRequest(reqRow);
            response.json({ ok: true, data: { request: reqRow, profile } });
        } catch (error) {
            if (previousLat === undefined) {
                delete profile.shopLatitude;
            } else {
                profile.shopLatitude = previousLat;
            }
            if (previousLng === undefined) {
                delete profile.shopLongitude;
            } else {
                profile.shopLongitude = previousLng;
            }
            reqRow.status = "pending";
            delete reqRow.reviewedAt;
            console.error("[admin/location-requests/approve]", error);
            response.status(500).json({
                error: error instanceof Error ? error.message : "Failed to approve"
            });
        }
    }
);

app.post(
    "/admin/location-requests/:id/reject",
    authenticate,
    authorizeRole(["admin"]),
    async (request, response) => {
        const id = z.string().min(1).parse(request.params.id);
        const schema = z.object({ reason: z.string().max(500).optional() });
        const parsed = schema.safeParse(request.body);
        if (!parsed.success) {
            response.status(400).json({ error: parsed.error.flatten() });
            return;
        }
        const reqRow = db.sellerLocationRequests.get(id);
        if (!reqRow || reqRow.status !== "pending") {
            response.status(404).json({ error: "Pending request not found" });
            return;
        }
        const previousStatus = reqRow.status;
        reqRow.status = "rejected";
        reqRow.reviewedAt = new Date().toISOString();
        if (parsed.data.reason?.trim()) {
            reqRow.rejectionReason = parsed.data.reason.trim();
        } else {
            delete reqRow.rejectionReason;
        }
        try {
            await persistSellerLocationChangeRequest(reqRow);
            response.json({ ok: true, data: reqRow });
        } catch (error) {
            reqRow.status = previousStatus;
            delete reqRow.reviewedAt;
            delete reqRow.rejectionReason;
            console.error("[admin/location-requests/reject]", error);
            response.status(500).json({
                error: error instanceof Error ? error.message : "Failed to reject"
            });
        }
    }
);

app.get("/admin/users", authenticate, authorizeRole(["admin"]), (request, response) => {
    const { page, limit } = parseListPagination(request.query);
    const rows = [...db.users.values()]
        .filter((u) => u.role !== "admin")
        .sort((a, b) => a.email.toLowerCase().localeCompare(b.email.toLowerCase()))
        .map((u) => ({
            id: u.id,
            email: u.email,
            role: u.role,
            fullName: u.fullName,
            suspended: Boolean(u.suspended),
            ...(u.role === "seller"
                ? { verificationStatus: db.sellerStatus.get(u.id) ?? "unsubmitted" }
                : {})
        }));
    const { data, pagination } = slicePaginated(rows, page, limit);
    response.json({ data, pagination });
});

app.get("/admin/users/:id", authenticate, authorizeRole(["admin"]), (request, response) => {
    const id = z.string().min(1).parse(request.params.id);
    const user = db.users.get(id);
    if (!user) {
        response.status(404).json({ error: "Not found" });
        return;
    }
    const profile = user.role === "seller" ? db.sellerProfiles.get(id) ?? null : null;
    const paymentMethods =
        user.role === "seller"
            ? [...db.sellerPaymentMethods.values()].filter((m) => m.sellerId === id)
            : [];
    const verificationStatus =
        user.role === "seller" ? db.sellerStatus.get(id) ?? "unsubmitted" : undefined;
    const verifications =
        user.role === "seller"
            ? [...db.verifications.values()]
                  .filter((v) => v.sellerId === id)
                  .sort((a, b) => (a.id < b.id ? 1 : -1))
            : [];
    response.json({
        data: {
            user,
            profile,
            paymentMethods,
            verificationStatus,
            verifications
        }
    });
});

app.post("/admin/users/:id/suspend", authenticate, authorizeRole(["admin"]), async (request, response) => {
    const id = z.string().min(1).parse(request.params.id);
    const actorId = request.authUserId as string;
    if (id === actorId) {
        response.status(400).json({ error: "Cannot suspend your own account" });
        return;
    }
    const user = db.users.get(id);
    if (!user) {
        response.status(404).json({ error: "Not found" });
        return;
    }
    if (user.suspended) {
        response.json({ ok: true });
        return;
    }
    if (isSupabaseAuthReady()) {
        const supabaseAdmin = createSupabaseAdminClient();
        if (!supabaseAdmin) {
            response.status(503).json({ error: "Authentication service unavailable" });
            return;
        }
        const { error } = await supabaseAdmin.auth.admin.updateUserById(id, {
            ban_duration: "876000h"
        });
        if (error) {
            response.status(500).json({ error: error.message });
            return;
        }
    }
    const next: AuthUser = { ...user, suspended: true };
    db.users.set(id, next);
    response.json({ ok: true });
});

app.post("/admin/users/:id/unsuspend", authenticate, authorizeRole(["admin"]), async (request, response) => {
    const id = z.string().min(1).parse(request.params.id);
    const user = db.users.get(id);
    if (!user) {
        response.status(404).json({ error: "Not found" });
        return;
    }
    if (isSupabaseAuthReady()) {
        const supabaseAdmin = createSupabaseAdminClient();
        if (!supabaseAdmin) {
            response.status(503).json({ error: "Authentication service unavailable" });
            return;
        }
        const { error } = await supabaseAdmin.auth.admin.updateUserById(id, {
            ban_duration: "none"
        });
        if (error) {
            response.status(500).json({ error: error.message });
            return;
        }
    }
    const next: AuthUser = {
        id: user.id,
        email: user.email,
        role: user.role,
        ...(user.fullName ? { fullName: user.fullName } : {}),
        ...(user.profileImageUrl ? { profileImageUrl: user.profileImageUrl } : {})
    };
    db.users.set(id, next);
    response.json({ ok: true });
});

app.delete("/admin/users/:id", authenticate, authorizeRole(["admin"]), async (request, response) => {
    const id = z.string().min(1).parse(request.params.id);
    const result = await adminDeleteUserAccount(id, request.authUserId as string);
    if (!("ok" in result)) {
        response.status(result.status).json({ error: result.error });
        return;
    }
    response.json({ ok: true });
});

app.post("/maps/geocode", authenticate, (_request, response) => {
    response.json({ message: "Geocode endpoint ready for Google API integration." });
});

app.post("/maps/directions", authenticate, (_request, response) => {
    response.json({ message: "Directions endpoint ready for Google API integration." });
});

app.post("/ai/guidance", authenticate, (request, response) => {
    const schema = z.object({ prompt: z.string().min(2) });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
        response.status(400).json({ error: parsed.error.flatten() });
        return;
    }

    response.json({
        answer: `Suggestion for "${parsed.data.prompt}": filter by finish and delivery lead time.`
    });
});

app.get("/recommendations", authenticate, (_request, response) => {
    const data = [...db.products.values()]
        .slice(0, 5)
        .map((p) => rewriteProductRecordForClient(p));
    response.json({ data });
});

app.get("/public/highlights", (_request, response) => {
    const publishedProducts = [...db.products.values()].filter((product) => product.isPublished);
    const featured = publishedProducts.filter((p) => p.isFeatured);
    const rest = publishedProducts.filter((p) => !p.isFeatured);
    const topProducts = [...featured, ...rest].slice(0, 6).map((p) => ({
        ...rewriteProductRecordForClient(p),
        thumbnailUrl: firstProductThumbnailUrl(p.id)
    }));
    const sellerCounter = new Map<string, number>();
    for (const product of publishedProducts) {
        sellerCounter.set(product.sellerId, (sellerCounter.get(product.sellerId) ?? 0) + 1);
    }

    const topSellers = [...sellerCounter.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([sellerId, publishedCount]) => {
            const seller = db.users.get(sellerId);
            return {
                id: sellerId,
                email: seller?.email ?? "unknown-seller",
                publishedCount
            };
        });

    response.json({
        recommendedProducts: topProducts,
        topSellers
    });
});

app.post(
    "/seller/ai/image-to-3d",
    authenticate,
    authorizeRole(["seller"]),
    async (request, response) => {
        const urlBody = z.object({ imageUrl: z.string().url() });
        const fileBody = z.object({
            imageBase64: z.string().min(1).max(16_000_000),
            mimeType: z.string().min(1).max(120)
        });
        const parsedUrl = urlBody.safeParse(request.body);
        const parsedFile = parsedUrl.success ? null : fileBody.safeParse(request.body);
        if (!parsedUrl.success && !parsedFile?.success) {
            response.status(400).json({
                error: parsedFile?.error.flatten() ?? parsedUrl.error.flatten()
            });
            return;
        }
        try {
            let falGlbUrl: string;
            if (parsedUrl.success) {
                falGlbUrl = await generateGlbUrlFromImageUrl(parsedUrl.data.imageUrl);
            } else if (parsedFile?.success) {
                falGlbUrl = await generateGlbUrlFromImageBuffer(
                    Buffer.from(parsedFile.data.imageBase64, "base64"),
                    parsedFile.data.mimeType
                );
            } else {
                response.status(400).json({ error: "Invalid body" });
                return;
            }
            response.json({ falGlbUrl });
        } catch (error) {
            if (isNsfwContentRejectedError(error)) {
                response.status(422).json({
                    error: error.message,
                    code: error.code,
                    nsfwProbability: error.nsfwProbability
                });
                return;
            }
            response.status(502).json({
                error: error instanceof Error ? error.message : "Image to 3D generation failed"
            });
        }
    }
);

app.post("/ai/fal/jobs", authenticate, (_request, response) => {
    response.status(202).json({ jobId: `fal-${Date.now()}`, status: "queued" });
});

app.get("/ai/fal/jobs/:jobId", authenticate, (request, response) => {
    response.json({ jobId: request.params.jobId, status: "completed" });
});

export { app };
