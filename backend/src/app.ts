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
import { authenticate } from "./middleware/authenticate";
import { db } from "./lib/store";
import { isSupabaseConfigured } from "./integrations/supabase/client";
import {
    deleteCartItem,
    deleteProductMedia,
    persistCartItem,
    persistCredential,
    persistCustomizationOption,
    persistCustomizationRule,
    persistOrder,
    persistOrderMessage,
    persistProduct,
    persistProductMedia,
    persistSellerStatus,
    persistSellerProfile,
    persistUser,
    persistVerification,
    syncFromSupabaseIfStale
} from "./integrations/supabase/persistence";
import { hashPassword, verifyPassword } from "./lib/password";
import { emitOrderMessage, emitOrderUpdated } from "./lib/realtime";
import { generateVerificationUploadTarget } from "./modules/verification/verification-storage";

const app = express();

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

function getOptionalAuthUserId(request: express.Request): string | null {
    const authorization = request.header("authorization");
    if (!authorization?.startsWith("Bearer ")) {
        return null;
    }
    const token = authorization.replace("Bearer ", "").trim();
    try {
        const payload = jwt.verify(token, env.JWT_SECRET) as { sub?: string };
        if (payload.sub && db.users.has(payload.sub)) {
            return payload.sub;
        }
    } catch {
        return null;
    }
    return null;
}

app.get("/health", (_request, response) => {
    response.json({
        ok: true,
        service: "backend",
        environment: env.NODE_ENV,
        storageProvider: isSupabaseConfigured() ? "supabase" : "in-memory"
    });
});

app.post("/auth/register", authLimiter, (request, response) => {
    const schema = z
        .object({
            email: z.string().email(),
            password: z.string().min(8).max(128),
            role: z.enum(["buyer", "seller"]),
            fullName: z.string().min(2).max(120).optional(),
            businessName: z.string().min(2).max(120).optional(),
            contactNumber: z.string().min(7).max(40).optional(),
            address: z.string().min(3).max(255).optional()
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
    persistUser(user);
    persistCredential(id, normalizedEmail, passwordHash);
    if (user.role === "seller") {
        db.sellerStatus.set(id, "unsubmitted");
        db.sellerProfiles.set(id, {
            sellerId: id,
            businessName: parsed.data.businessName as string,
            contactNumber: parsed.data.contactNumber as string,
            address: parsed.data.address as string
        });
        persistSellerStatus(id, "unsubmitted");
        persistSellerProfile(db.sellerProfiles.get(id)!);
    }

    const token = jwt.sign({ sub: user.id, role: user.role }, env.JWT_SECRET, {
        expiresIn: "2h"
    });

    response.status(201).json({ token, user });
});

app.post("/auth/login", authLimiter, (request, response) => {
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
    if (!seller || seller.role !== "seller" || !profile) {
        response.status(404).json({ error: "Seller profile not found" });
        return;
    }
    response.json({
        data: {
            id: seller.id,
            email: seller.email,
            ...profile,
            verificationStatus: db.sellerStatus.get(id) ?? "unsubmitted",
            publishedProducts: [...db.products.values()].filter(
                (product) => product.sellerId === id && product.isPublished
            ).length
        }
    });
});

app.get("/seller/profile", authenticate, authorizeRole(["seller"]), (request, response) => {
    const profile = db.sellerProfiles.get(request.authUserId as string);
    if (!profile) {
        response.status(404).json({ error: "Seller profile not found" });
        return;
    }
    response.json({ data: profile });
});

app.patch("/seller/profile", authenticate, authorizeRole(["seller"]), (request, response) => {
    const schema = z.object({
        businessName: z.string().min(2).max(120).optional(),
        contactNumber: z.string().min(7).max(40).optional(),
        address: z.string().min(3).max(255).optional(),
        profileImageUrl: z.string().url().optional(),
        storeBackgroundUrl: z.string().url().optional(),
        paymentQrUrl: z.string().url().optional()
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

    profile.businessName = parsed.data.businessName ?? profile.businessName;
    profile.contactNumber = parsed.data.contactNumber ?? profile.contactNumber;
    profile.address = parsed.data.address ?? profile.address;
    if (parsed.data.profileImageUrl) {
        profile.profileImageUrl = parsed.data.profileImageUrl;
    }
    if (parsed.data.storeBackgroundUrl) {
        profile.storeBackgroundUrl = parsed.data.storeBackgroundUrl;
    }
    if (parsed.data.paymentQrUrl) {
        profile.paymentQrUrl = parsed.data.paymentQrUrl;
    }
    persistSellerProfile(profile);

    response.json({ ok: true, data: profile });
});

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
    "/seller/verification/submit",
    authenticate,
    authorizeRole(["seller"]),
    (request, response) => {
        const schema = z.object({
            permitFileUrl: z.string().url(),
            note: z.string().max(1000).optional()
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
            ...(parsed.data.note ? { note: parsed.data.note } : {})
        };
        db.verifications.set(id, {
            ...submission
        });
        db.sellerStatus.set(request.authUserId as string, "pending");
        persistVerification(submission);
        persistSellerStatus(request.authUserId as string, "pending");
        response.status(201).json({ id, status: "pending" });
    }
);

app.get(
    "/seller/verification/status",
    authenticate,
    authorizeRole(["seller"]),
    (request, response) => {
        response.json({
            status: db.sellerStatus.get(request.authUserId as string) ?? "unsubmitted"
        });
    }
);

app.post(
    "/seller/verification/resubmit",
    authenticate,
    authorizeRole(["seller"]),
    (request, response) => {
        const schema = z.object({
            permitFileUrl: z.string().url(),
            note: z.string().max(1000).optional()
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
            ...(parsed.data.note ? { note: parsed.data.note } : {})
        };
        db.verifications.set(id, submission);
        db.sellerStatus.set(request.authUserId as string, "pending");
        persistVerification(submission);
        persistSellerStatus(request.authUserId as string, "pending");
        response.status(201).json({ id, status: "pending" });
    }
);

app.get("/admin/verifications", authenticate, authorizeRole(["admin"]), (request, response) => {
    const status = request.query.status;
    const rows = [...db.verifications.values()].filter((entry) =>
        typeof status === "string" ? entry.status === status : true
    );
    response.json({ data: rows });
});

app.get("/admin/verifications/:id", authenticate, authorizeRole(["admin"]), (request, response) => {
    const id = z.string().min(1).parse(request.params.id);
    const verification = db.verifications.get(id);
    if (!verification) {
        response.status(404).json({ error: "Not found" });
        return;
    }
    response.json({ data: verification });
});

app.post(
    "/admin/verifications/:id/approve",
    authenticate,
    authorizeRole(["admin"]),
    (request, response) => {
        const id = z.string().min(1).parse(request.params.id);
        const verification = db.verifications.get(id);
        if (!verification) {
            response.status(404).json({ error: "Not found" });
            return;
        }
        verification.status = "approved";
        db.sellerStatus.set(verification.sellerId, "approved");
        persistVerification(verification);
        persistSellerStatus(verification.sellerId, "approved");
        response.json({ ok: true });
    }
);

app.post(
    "/admin/verifications/:id/reject",
    authenticate,
    authorizeRole(["admin"]),
    (request, response) => {
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
        verification.status = "rejected";
        verification.rejectionReason = parsed.data.reason;
        db.sellerStatus.set(verification.sellerId, "rejected");
        persistVerification(verification);
        persistSellerStatus(verification.sellerId, "rejected");
        response.json({ ok: true });
    }
);

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
        basePrice: z.number().positive().optional()
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
        response.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    product.title = parsed.data.title ?? product.title;
    product.description = parsed.data.description ?? product.description;
    product.basePrice = parsed.data.basePrice ?? product.basePrice;
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
    response.json({ data: { ...product, media, options } });
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

app.get("/cart", (request, response) => {
    const authUserId = getOptionalAuthUserId(request);
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

app.post("/cart/items", (request, response) => {
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
    const authUserId = getOptionalAuthUserId(request);
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

app.patch("/cart/items/:itemId", (request, response) => {
    const itemId = z.string().min(1).parse(request.params.itemId);
    const cartItem = db.cartItems.get(itemId);
    const authUserId = getOptionalAuthUserId(request);
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

app.delete("/cart/items/:itemId", (request, response) => {
    const itemId = z.string().min(1).parse(request.params.itemId);
    const cartItem = db.cartItems.get(itemId);
    const authUserId = getOptionalAuthUserId(request);
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
        order.status = parsed.data.status;
        persistOrder(order);
        emitOrderUpdated(order);
        response.json({ ok: true, status: order.status });
    }
);

app.get("/admin/users", authenticate, authorizeRole(["admin"]), (_request, response) => {
    response.json({ data: [...db.users.values()] });
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
