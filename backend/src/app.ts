import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { z } from "zod";
import { env } from "./config/env";
import { authorizeRole } from "./middleware/authorize-role";
import { authenticate } from "./middleware/authenticate";
import { db } from "./lib/store";

const app = express();

app.use(helmet());
app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
app.use(morgan("dev"));
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

app.get("/health", (_request, response) => {
  response.json({ ok: true, service: "backend", environment: env.NODE_ENV });
});

app.post("/auth/login", (request, response) => {
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

  response.json({ token: `dev-token-${user.id}`, user });
});

app.get("/auth/me", authenticate, (request, response) => {
  response.json({ user: db.users.get(request.authUserId as string) });
});

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
  db.products.set(id, {
    id,
    sellerId: request.authUserId as string,
    title: parsed.data.title,
    description: parsed.data.description,
    basePrice: parsed.data.basePrice,
    isPublished: false,
  });
  response.status(201).json({ id });
});

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
    response.json({ ok: true });
  },
);

app.get("/products", (_request, response) => {
  const data = [...db.products.values()].filter((row) => row.isPublished);
  response.json({ data });
});

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
  db.cartItems.set(id, {
    id,
    buyerId: request.authUserId as string,
    productId: parsed.data.productId,
    quantity: parsed.data.quantity,
  });
  response.status(201).json({ id });
});

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
  db.orders.set(id, {
    id,
    buyerId,
    status: "created",
    createdAt: new Date().toISOString(),
  });

  for (const entry of items) {
    db.cartItems.delete(entry.id);
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
