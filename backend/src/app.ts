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
import { db } from "./lib/store";
import {
    createSupabaseAdminClient,
    createSupabaseAnonClient,
    isSupabaseAuthReady,
    isSupabaseConfigured
} from "./integrations/supabase/client";
import {
    deleteCartItem,
    deleteCustomizationOptionsByProduct,
    deleteCustomizationRulesByProduct,
    deleteProduct,
    deleteProductMedia,
    deleteProductMediaByProduct,
    deleteSellerPaymentMethod,
    deleteSellerProfileBySellerId,
    deleteSellerStatusBySellerId,
    deleteVerificationById,
    persistCartItem,
    persistCustomizationOption,
    persistCustomizationRule,
    persistOrder,
    persistOrderMessage,
    persistProduct,
    persistProductMedia,
    persistSellerPaymentMethod,
    persistSellerStatus,
    persistSellerProfile,
    persistVerification,
    syncFromSupabaseIfStale
} from "./integrations/supabase/persistence";
import { hashPassword, verifyPassword } from "./lib/password";
import { emitOrderMessage, emitOrderUpdated } from "./lib/realtime";
import {
    createSignedVerificationDownloadUrl,
    extractVerificationObjectPath,
    generateVerificationUploadTarget
} from "./modules/verification/verification-storage";
import type { AuthUser } from "./types/domain";

const app = express();

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
        for (const m of [...db.sellerPaymentMethods.values()]) {
            if (m.sellerId === targetId) {
                db.sellerPaymentMethods.delete(m.id);
                deleteSellerPaymentMethod(m.id);
            }
        }
        db.sellerProfiles.delete(targetId);
        deleteSellerProfileBySellerId(targetId);
        db.sellerStatus.delete(targetId);
        deleteSellerStatusBySellerId(targetId);
    }
    if (target.role === "buyer") {
        for (const item of [...db.cartItems.values()]) {
            if (item.buyerId === targetId) {
                db.cartItems.delete(item.id);
                deleteCartItem(item.id);
            }
        }
    }
    db.users.delete(targetId);
    return { ok: true };
}

app.use(helmet());
app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
app.use(morgan("dev"));
app.use(express.json({ limit: "2mb" }));
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

app.post("/auth/logout", authenticate, (_request, response) => {
    response.json({ ok: true });
});

app.get("/auth/me", authenticate, (request, response) => {
    response.json({ user: db.users.get(request.authUserId as string) });
});

app.get("/sellers/:id/profile", (request, response) => {
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
    response.json({
        data: {
            id: seller.id,
            email: seller.email,
            ...profile,
            paymentMethods,
            verificationStatus: db.sellerStatus.get(id) ?? "unsubmitted",
            publishedProducts: [...db.products.values()].filter(
                (product) => product.sellerId === id && product.isPublished
            ).length
        }
    });
});

app.get("/seller/profile", authenticate, authorizeRole(["seller"]), (request, response) => {
    const sellerId = request.authUserId as string;
    const profile = db.sellerProfiles.get(sellerId);
    const user = db.users.get(sellerId);
    if (!profile) {
        response.status(404).json({ error: "Seller profile not found" });
        return;
    }
    response.json({
        data: {
            id: sellerId,
            ...profile,
            paymentMethods: [...db.sellerPaymentMethods.values()].filter(
                (entry) => entry.sellerId === sellerId
            ),
            fullName: user?.fullName,
            email: user?.email
        }
    });
});

app.patch("/seller/profile", authenticate, authorizeRole(["seller"]), async (request, response) => {
    const schema = z.object({
        fullName: z.string().min(2).max(120).optional(),
        businessName: z.string().min(2).max(120).optional(),
        contactNumber: z.string().min(7).max(40).optional(),
        address: z.string().min(3).max(255).optional(),
        shopLatitude: z.number().gte(-90).lte(90).optional(),
        shopLongitude: z.number().gte(-180).lte(180).optional(),
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
        shopLatitude: profile.shopLatitude,
        shopLongitude: profile.shopLongitude,
        profileImageUrl: profile.profileImageUrl,
        storeBackgroundUrl: profile.storeBackgroundUrl
    };

    profile.businessName = parsed.data.businessName ?? profile.businessName;
    profile.contactNumber = parsed.data.contactNumber ?? profile.contactNumber;
    profile.address = parsed.data.address ?? profile.address;
    if (parsed.data.shopLatitude !== undefined) {
        profile.shopLatitude = parsed.data.shopLatitude;
    }
    if (parsed.data.shopLongitude !== undefined) {
        profile.shopLongitude = parsed.data.shopLongitude;
    }
    if (parsed.data.profileImageUrl) {
        profile.profileImageUrl = parsed.data.profileImageUrl;
    }
    if (parsed.data.storeBackgroundUrl) {
        profile.storeBackgroundUrl = parsed.data.storeBackgroundUrl;
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
        if (previous.shopLatitude !== undefined) {
            profile.shopLatitude = previous.shopLatitude;
        } else {
            delete profile.shopLatitude;
        }
        if (previous.shopLongitude !== undefined) {
            profile.shopLongitude = previous.shopLongitude;
        } else {
            delete profile.shopLongitude;
        }
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

app.get(
    "/seller/payment-methods",
    authenticate,
    authorizeRole(["seller"]),
    (request, response) => {
        const sellerId = request.authUserId as string;
        const data = [...db.sellerPaymentMethods.values()].filter(
            (entry) => entry.sellerId === sellerId
        );
        response.json({ data });
    }
);

app.post(
    "/seller/payment-methods",
    authenticate,
    authorizeRole(["seller"]),
    (request, response) => {
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
            ...(parsed.data.qrImageUrl ? { qrImageUrl: parsed.data.qrImageUrl } : {})
        };
        db.sellerPaymentMethods.set(id, row);
        persistSellerPaymentMethod(row);
        response.status(201).json({ data: row });
    }
);

app.patch(
    "/seller/payment-methods/:id",
    authenticate,
    authorizeRole(["seller"]),
    (request, response) => {
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
        row.methodName = parsed.data.methodName ?? row.methodName;
        row.accountName = parsed.data.accountName ?? row.accountName;
        row.accountNumber = parsed.data.accountNumber ?? row.accountNumber;
        if (parsed.data.qrImageUrl) {
            row.qrImageUrl = parsed.data.qrImageUrl;
        }
        persistSellerPaymentMethod(row);
        response.json({ data: row });
    }
);

app.delete(
    "/seller/payment-methods/:id",
    authenticate,
    authorizeRole(["seller"]),
    (request, response) => {
        const id = z.string().min(1).parse(request.params.id);
        const row = db.sellerPaymentMethods.get(id);
        if (!row || row.sellerId !== request.authUserId) {
            response.status(404).json({ error: "Payment method not found" });
            return;
        }
        db.sellerPaymentMethods.delete(id);
        deleteSellerPaymentMethod(id);
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
        for (const method of [...db.sellerPaymentMethods.values()]) {
            if (method.sellerId === user.id) {
                db.sellerPaymentMethods.delete(method.id);
            }
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
        (entry) => entry.paymentMethod === "online" && entry.paymentStatus !== "paid"
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
    const data = [...db.products.values()].filter((row) => row.sellerId === sellerId);
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
    response.json({ data: { ...product, media, options, rules } });
});

app.post("/products", authenticate, authorizeRole(["seller"]), (request, response) => {
    const schema = z.object({
        title: z.string().min(2),
        description: z.string().min(3),
        basePrice: z.number().positive()
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
        response.status(400).json({ error: parsed.error.flatten() });
        return;
    }

    const id = `p-${Date.now()}`;
    const product = {
        id,
        sellerId: request.authUserId as string,
        title: parsed.data.title,
        description: parsed.data.description,
        basePrice: parsed.data.basePrice,
        isPublished: false
    };
    db.products.set(id, product);
    persistProduct(product);
    response.status(201).json({ id });
});

app.patch("/products/:id", authenticate, authorizeRole(["seller"]), (request, response) => {
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
        model3dUrl: z.string().url().optional()
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
        response.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    product.title = parsed.data.title ?? product.title;
    product.description = parsed.data.description ?? product.description;
    product.basePrice = parsed.data.basePrice ?? product.basePrice;
    if (parsed.data.model3dUrl) {
        product.model3dUrl = parsed.data.model3dUrl;
    }
    persistProduct(product);
    response.json({ ok: true, data: product });
});

app.post("/products/:id/publish", authenticate, authorizeRole(["seller"]), (request, response) => {
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
    persistProduct(product);
    response.json({ ok: true });
});

app.post(
    "/products/:id/unpublish",
    authenticate,
    authorizeRole(["seller"]),
    (request, response) => {
        const id = z.string().min(1).parse(request.params.id);
        const product = db.products.get(id);
        if (!product || product.sellerId !== request.authUserId) {
            response.status(404).json({ error: "Not found" });
            return;
        }
        product.isPublished = false;
        persistProduct(product);
        response.json({ ok: true });
    }
);

app.get("/products", searchLimiter, (_request, response) => {
    const data = [...db.products.values()].filter((row) => row.isPublished);
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
    response.json({ data: { ...product, media, options, rules } });
});

app.delete("/products/:id", authenticate, authorizeRole(["seller"]), (request, response) => {
    const id = z.string().min(1).parse(request.params.id);
    const product = db.products.get(id);
    if (!product || product.sellerId !== request.authUserId) {
        response.status(404).json({ error: "Not found" });
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
    deleteProductMediaByProduct(id);
    deleteCustomizationOptionsByProduct(id);
    deleteCustomizationRulesByProduct(id);
    deleteProduct(id);
    response.json({ ok: true });
});

app.post("/products/:id/media", authenticate, authorizeRole(["seller"]), (request, response) => {
    const productId = z.string().min(1).parse(request.params.id);
    const product = db.products.get(productId);
    if (!product || product.sellerId !== request.authUserId) {
        response.status(404).json({ error: "Not found" });
        return;
    }
    const schema = z.object({ url: z.string().url() });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
        response.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    const id = `pm-${Date.now()}`;
    const media = { id, productId, url: parsed.data.url };
    db.productMedia.set(id, media);
    persistProductMedia(media);
    response.status(201).json({ id });
});

app.delete(
    "/products/:id/media/:mediaId",
    authenticate,
    authorizeRole(["seller"]),
    (request, response) => {
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
        db.productMedia.delete(mediaId);
        deleteProductMedia(mediaId);
        response.json({ ok: true });
    }
);

app.post(
    "/products/:id/customization-options",
    authenticate,
    authorizeRole(["seller"]),
    (request, response) => {
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
        persistCustomizationOption(option);
        response.status(201).json({ id });
    }
);

app.patch(
    "/products/:id/customization-options/:optionId",
    authenticate,
    authorizeRole(["seller"]),
    (request, response) => {
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
        option.name = parsed.data.name ?? option.name;
        option.values = parsed.data.values ?? option.values;
        persistCustomizationOption(option);
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
            response.status(403).json({ error: "Forbidden" });
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
        quantity: z.number().int().positive()
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
        response.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    const id = `ci-${Date.now()}`;
    const authUserId = await resolveOptionalAuthUserId(request);
    const guestSessionId = getGuestSessionId(request);

    if (!authUserId && !guestSessionId) {
        response
            .status(400)
            .json({ error: "Guest session id is required for guest cart operations" });
        return;
    }
    const cartItem = {
        id,
        ...(authUserId ? { buyerId: authUserId } : {}),
        ...(!authUserId && guestSessionId ? { guestSessionId } : {}),
        productId: parsed.data.productId,
        quantity: parsed.data.quantity
    };
    db.cartItems.set(id, cartItem);
    persistCartItem(cartItem);
    response.status(201).json({ id });
});

app.patch("/cart/items/:itemId", async (request, response) => {
    const itemId = z.string().min(1).parse(request.params.itemId);
    const cartItem = db.cartItems.get(itemId);
    const authUserId = await resolveOptionalAuthUserId(request);
    const guestSessionId = getGuestSessionId(request);
    const isOwner = authUserId
        ? cartItem?.buyerId === authUserId
        : cartItem?.guestSessionId === guestSessionId;
    if (!cartItem || !isOwner) {
        response.status(404).json({ error: "Not found" });
        return;
    }
    const schema = z.object({ quantity: z.number().int().positive() });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
        response.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    cartItem.quantity = parsed.data.quantity;
    persistCartItem(cartItem);
    response.json({ ok: true, data: cartItem });
});

app.delete("/cart/items/:itemId", async (request, response) => {
    const itemId = z.string().min(1).parse(request.params.itemId);
    const cartItem = db.cartItems.get(itemId);
    const authUserId = await resolveOptionalAuthUserId(request);
    const guestSessionId = getGuestSessionId(request);
    const isOwner = authUserId
        ? cartItem?.buyerId === authUserId
        : cartItem?.guestSessionId === guestSessionId;
    if (!cartItem || !isOwner) {
        response.status(404).json({ error: "Not found" });
        return;
    }
    db.cartItems.delete(itemId);
    deleteCartItem(itemId);
    response.json({ ok: true });
});

app.post("/checkout", authenticate, authorizeRole(["buyer"]), (request, response) => {
    const schema = z.object({
        paymentMethod: z.enum(["cash", "online"]),
        paymentReference: z.string().max(200).optional()
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
        response.status(400).json({ error: parsed.error.flatten() });
        return;
    }

    const buyerId = request.authUserId as string;
    const guestSessionId = getGuestSessionId(request);
    if (guestSessionId) {
        const guestItems = [...db.cartItems.values()].filter(
            (entry) => entry.guestSessionId === guestSessionId
        );
        for (const item of guestItems) {
            item.buyerId = buyerId;
            delete item.guestSessionId;
            persistCartItem(item);
        }
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

    const uniqueSellers = new Set(products.map((product) => product.sellerId));
    if (uniqueSellers.size !== 1) {
        response.status(400).json({ error: "Checkout currently supports one seller per order" });
        return;
    }
    const sellerId = uniqueSellers.values().next().value;
    if (!sellerId) {
        response.status(400).json({ error: "Unable to resolve seller for checkout" });
        return;
    }
    const totalAmount = items.reduce((sum, item) => {
        const product = products.find((entry) => entry.id === item.productId);
        return sum + (product?.basePrice ?? 0) * item.quantity;
    }, 0);

    const id = `o-${Date.now()}`;
    const order = {
        id,
        buyerId,
        sellerId,
        status: "created" as const,
        paymentMethod: parsed.data.paymentMethod,
        ...(parsed.data.paymentReference ? { paymentReference: parsed.data.paymentReference } : {}),
        paymentStatus: "pending" as const,
        receiptStatus:
            parsed.data.paymentMethod === "online"
                ? (parsed.data.paymentReference ? ("submitted" as const) : ("none" as const))
                : ("none" as const),
        totalAmount,
        createdAt: new Date().toISOString()
    };
    db.orders.set(id, order);
    persistOrder(order);
    emitOrderUpdated(order);

    for (const entry of items) {
        db.cartItems.delete(entry.id);
        deleteCartItem(entry.id);
    }

    response.status(201).json({ id, status: "created", totalAmount });
});

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
    response.json({ data: order });
});

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
    (request, response) => {
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
        persistOrderMessage(message);
        emitOrderMessage(message);
        response.status(201).json({ data: message });
    }
);

app.post(
    "/orders/:id/status",
    authenticate,
    authorizeRole(["seller", "admin"]),
    (request, response) => {
        const schema = z.object({
            status: z.enum(["confirmed", "processing", "shipped", "delivered"])
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
        const transitions: Record<string, string[]> = {
            created: ["confirmed"],
            confirmed: ["processing", "shipped"],
            processing: ["shipped"],
            shipped: ["delivered"],
            delivered: []
        };
        const allowed = transitions[order.status] ?? [];
        if (!allowed.includes(parsed.data.status) && parsed.data.status !== order.status) {
            response.status(400).json({ error: "Invalid status transition" });
            return;
        }
        order.status = parsed.data.status;
        persistOrder(order);
        emitOrderUpdated(order);
        response.json({ ok: true, status: order.status });
    }
);

app.post(
    "/orders/:id/payment-status",
    authenticate,
    authorizeRole(["seller", "admin"]),
    (request, response) => {
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
        persistOrder(order);
        emitOrderUpdated(order);
        response.json({ ok: true, paymentStatus: order.paymentStatus });
    }
);

app.post(
    "/orders/:id/request-receipt",
    authenticate,
    authorizeRole(["seller", "admin"]),
    (request, response) => {
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
        order.paymentStatus = "pending";
        order.receiptStatus = "resubmit_requested";
        order.receiptRequestNote = parsed.data.note;
        persistOrder(order);
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
    response.json({
        data: {
            pendingVerifications,
            verifiedSellers,
            unverifiedSellers: sellers.length - verifiedSellers,
            totalSellers: sellers.length
        }
    });
});

app.get("/admin/users", authenticate, authorizeRole(["admin"]), (request, response) => {
    const { page, limit } = parseListPagination(request.query);
    const rows = [...db.users.values()]
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
        ...(user.fullName ? { fullName: user.fullName } : {})
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
    response.json({ data: [...db.products.values()].slice(0, 5) });
});

app.get("/public/highlights", (_request, response) => {
    const publishedProducts = [...db.products.values()].filter((product) => product.isPublished);
    const topProducts = publishedProducts.slice(0, 6);
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

app.post("/ai/fal/jobs", authenticate, (_request, response) => {
    response.status(202).json({ jobId: `fal-${Date.now()}`, status: "queued" });
});

app.get("/ai/fal/jobs/:jobId", authenticate, (request, response) => {
    response.json({ jobId: request.params.jobId, status: "completed" });
});

export { app };
