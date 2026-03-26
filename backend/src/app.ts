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
  persistCustomizationOption,
  persistCustomizationRule,
  persistOrder,
  persistProduct,
  persistProductMedia,
  persistSellerStatus,
  persistUser,
  persistVerification,
  syncFromSupabaseIfStale,
} from "./integrations/supabase/persistence";
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

app.get("/health", (_request, response) => {
  response.json({
    ok: true,
    service: "backend",
    environment: env.NODE_ENV,
    storageProvider: isSupabaseConfigured() ? "supabase" : "in-memory",
  });
});

app.post("/auth/register", authLimiter, (request, response) => {
  const schema = z.object({
    email: z.string().email(),
    role: z.enum(["buyer", "seller"]),
  });
  const parsed = schema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const id = `u-${randomUUID()}`;
  const user = { id, email: parsed.data.email, role: parsed.data.role };
  db.users.set(id, user);
  persistUser(user);
  if (user.role === "seller") {
    db.sellerStatus.set(id, "unsubmitted");
    persistSellerStatus(id, "unsubmitted");
  }

  const token = jwt.sign({ sub: user.id, role: user.role }, env.JWT_SECRET, {
    expiresIn: "2h",
  });

  response.status(201).json({ token, user });
});

app.post("/auth/login", authLimiter, (request, response) => {
  const schema = z.object({ userId: z.string().min(1) });
  const parsed = schema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const user = db.users.get(parsed.data.userId);
  if (!user) {
    response.status(404).json({ error: "User not found" });
    return;
  }

  const token = jwt.sign({ sub: user.id, role: user.role }, env.JWT_SECRET, {
    expiresIn: "2h",
  });
  response.json({ token, user });
});

app.post("/auth/logout", authenticate, (_request, response) => {
  response.json({ ok: true });
});

app.get("/auth/me", authenticate, (request, response) => {
  response.json({ user: db.users.get(request.authUserId as string) });
});

app.post(
  "/seller/verification/upload-url",
  authenticate,
  authorizeRole(["seller"]),
  async (request, response) => {
    const schema = z.object({
      filename: z.string().min(3).max(255),
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const target = await generateVerificationUploadTarget(
      request.authUserId as string,
      parsed.data.filename,
    );

    response.status(201).json(target);
  },
);

app.post(
  "/seller/verification/submit",
  authenticate,
  authorizeRole(["seller"]),
  (request, response) => {
    const schema = z.object({
      permitFileUrl: z.string().url(),
      note: z.string().max(1000).optional(),
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
      ...(parsed.data.note ? { note: parsed.data.note } : {}),
    };
    db.verifications.set(id, {
      ...submission,
    });
    db.sellerStatus.set(request.authUserId as string, "pending");
    persistVerification(submission);
    persistSellerStatus(request.authUserId as string, "pending");
    response.status(201).json({ id, status: "pending" });
  },
);

app.get(
  "/seller/verification/status",
  authenticate,
  authorizeRole(["seller"]),
  (request, response) => {
    response.json({
      status: db.sellerStatus.get(request.authUserId as string) ?? "unsubmitted",
    });
  },
);

app.post(
  "/seller/verification/resubmit",
  authenticate,
  authorizeRole(["seller"]),
  (request, response) => {
    const schema = z.object({
      permitFileUrl: z.string().url(),
      note: z.string().max(1000).optional(),
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
      ...(parsed.data.note ? { note: parsed.data.note } : {}),
    };
    db.verifications.set(id, submission);
    db.sellerStatus.set(request.authUserId as string, "pending");
    persistVerification(submission);
    persistSellerStatus(request.authUserId as string, "pending");
    response.status(201).json({ id, status: "pending" });
  },
);

app.get(
  "/admin/verifications",
  authenticate,
  authorizeRole(["admin"]),
  (request, response) => {
    const status = request.query.status;
    const rows = [...db.verifications.values()].filter((entry) =>
      typeof status === "string" ? entry.status === status : true,
    );
    response.json({ data: rows });
  },
);

app.get(
  "/admin/verifications/:id",
  authenticate,
  authorizeRole(["admin"]),
  (request, response) => {
    const id = z.string().min(1).parse(request.params.id);
    const verification = db.verifications.get(id);
    if (!verification) {
      response.status(404).json({ error: "Not found" });
      return;
    }
    response.json({ data: verification });
  },
);

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
  },
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
  },
);

app.post("/products", authenticate, authorizeRole(["seller"]), (request, response) => {
  const schema = z.object({
    title: z.string().min(2),
    description: z.string().min(3),
    basePrice: z.number().positive(),
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
    isPublished: false,
  };
  db.products.set(id, product);
  persistProduct(product);
  response.status(201).json({ id });
});

app.patch(
  "/products/:id",
  authenticate,
  authorizeRole(["seller"]),
  (request, response) => {
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
  },
);

app.post(
  "/products/:id/publish",
  authenticate,
  authorizeRole(["seller"]),
  (request, response) => {
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
  },
);

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
  },
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
  const options = [...db.customizationOptions.values()].filter(
    (entry) => entry.productId === id,
  );
  response.json({ data: { ...product, media, options } });
});

app.post(
  "/products/:id/media",
  authenticate,
  authorizeRole(["seller"]),
  (request, response) => {
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
  },
);

app.delete(
  "/products/:id/media/:mediaId",
  authenticate,
  authorizeRole(["seller"]),
  (request, response) => {
    const productId = z.string().min(1).parse(request.params.id);
    const mediaId = z.string().min(1).parse(request.params.mediaId);
    const product = db.products.get(productId);
    const media = db.productMedia.get(mediaId);
    if (!product || !media || product.sellerId !== request.authUserId || media.productId !== productId) {
      response.status(404).json({ error: "Not found" });
      return;
    }
    db.productMedia.delete(mediaId);
    deleteProductMedia(mediaId);
    response.json({ ok: true });
  },
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
    const schema = z.object({ name: z.string().min(1), values: z.array(z.string().min(1)).min(1) });
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
  },
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
    const schema = z.object({ name: z.string().min(1).optional(), values: z.array(z.string().min(1)).min(1).optional() });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    option.name = parsed.data.name ?? option.name;
    option.values = parsed.data.values ?? option.values;
    persistCustomizationOption(option);
    response.json({ ok: true, data: option });
  },
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
      amount: parsed.data.amount,
    };
    db.customizationRules.set(id, rule);
    persistCustomizationRule(rule);
    response.status(201).json({ id });
  },
);

app.post("/products/:id/price-preview", (request, response) => {
  const schema = z.object({
    multiplier: z.number().min(0.1).max(10).default(1),
    addOn: z.number().min(0).default(0),
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

app.get("/cart", authenticate, authorizeRole(["buyer"]), (request, response) => {
  const buyerId = request.authUserId as string;
  const items = [...db.cartItems.values()].filter((entry) => entry.buyerId === buyerId);
  response.json({ data: items });
});

app.post("/cart/items", authenticate, authorizeRole(["buyer"]), (request, response) => {
  const schema = z.object({
    productId: z.string().min(1),
    quantity: z.number().int().positive(),
  });
  const parsed = schema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const id = `ci-${Date.now()}`;
  const cartItem = {
    id,
    buyerId: request.authUserId as string,
    productId: parsed.data.productId,
    quantity: parsed.data.quantity,
  };
  db.cartItems.set(id, cartItem);
  persistCartItem(cartItem);
  response.status(201).json({ id });
});

app.patch(
  "/cart/items/:itemId",
  authenticate,
  authorizeRole(["buyer"]),
  (request, response) => {
    const itemId = z.string().min(1).parse(request.params.itemId);
    const cartItem = db.cartItems.get(itemId);
    if (!cartItem || cartItem.buyerId !== request.authUserId) {
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
  },
);

app.delete(
  "/cart/items/:itemId",
  authenticate,
  authorizeRole(["buyer"]),
  (request, response) => {
    const itemId = z.string().min(1).parse(request.params.itemId);
    const cartItem = db.cartItems.get(itemId);
    if (!cartItem || cartItem.buyerId !== request.authUserId) {
      response.status(404).json({ error: "Not found" });
      return;
    }
    db.cartItems.delete(itemId);
    deleteCartItem(itemId);
    response.json({ ok: true });
  },
);

app.post("/checkout", authenticate, authorizeRole(["buyer"]), (request, response) => {
  const buyerId = request.authUserId as string;
  const items = [...db.cartItems.values()].filter((entry) => entry.buyerId === buyerId);
  if (items.length === 0) {
    response.status(400).json({ error: "Cart is empty" });
    return;
  }

  const id = `o-${Date.now()}`;
  const order = {
    id,
    buyerId,
    status: "created" as const,
    createdAt: new Date().toISOString(),
  };
  db.orders.set(id, order);
  persistOrder(order);

  for (const entry of items) {
    db.cartItems.delete(entry.id);
    deleteCartItem(entry.id);
  }

  response.status(201).json({ id, status: "created" });
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
  if (user.role !== "admin" && order.buyerId !== user.id) {
    response.status(403).json({ error: "Forbidden" });
    return;
  }
  response.json({ data: order });
});

app.post(
  "/orders/:id/status",
  authenticate,
  authorizeRole(["seller", "admin"]),
  (request, response) => {
    const schema = z.object({
      status: z.enum(["confirmed", "processing", "shipped", "delivered"]),
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
    order.status = parsed.data.status;
    persistOrder(order);
    response.json({ ok: true, status: order.status });
  },
);

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
    answer: `Suggestion for "${parsed.data.prompt}": filter by finish and delivery lead time.`,
  });
});

app.get("/recommendations", authenticate, (_request, response) => {
  response.json({ data: [...db.products.values()].slice(0, 5) });
});

app.post("/ai/fal/jobs", authenticate, (_request, response) => {
  response.status(202).json({ jobId: `fal-${Date.now()}`, status: "queued" });
});

app.get("/ai/fal/jobs/:jobId", authenticate, (request, response) => {
  response.json({ jobId: request.params.jobId, status: "completed" });
});

export { app };
