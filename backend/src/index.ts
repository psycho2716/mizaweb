import dotenv from "dotenv";

// Support both local (development) and deployment environments.
// Supabase/Next apps often use `.env.local`; production typically uses `.env`.
dotenv.config({ path: ".env.local" });

import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import http from "http";
import { Server as SocketIOServer } from "socket.io";

import { env } from "./lib/env";
import { createAnonSupabaseClient } from "./lib/supabase";

const app = express();

app.use(helmet());
app.use(express.json({ limit: "1mb" }));
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(morgan("dev"));

app.get("/healthz", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get("/products", async (req, res) => {
  const category = typeof req.query.category === "string" ? req.query.category : undefined;
  const query = typeof req.query.query === "string" ? req.query.query : undefined;

  const supabase = createAnonSupabaseClient();

  // RLS handles "published + approved seller" gating; these filters just help the catalog.
  let productsQuery = supabase
    .from("products")
    .select("id,seller_id,name,category,description,primary_image_storage_path,status")
    .eq("status", "published");

  if (category) productsQuery = productsQuery.eq("category", category);
  if (query) productsQuery = productsQuery.ilike("name", `%${query}%`);

  productsQuery = productsQuery.limit(50);

  const { data, error } = await productsQuery;
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.status(200).json({ products: data ?? [] });
});

app.get("/readyz", (_req, res) => {
  // In Phase 0 we only validate env presence (via `env` import).
  res.status(200).json({ status: "ready" });
});

const httpServer = http.createServer(app);

export const io = new SocketIOServer(httpServer, {
  cors: { origin: env.CORS_ORIGIN, credentials: true },
});

io.on("connection", (socket) => {
  // Placeholder for job lifecycle rooms/events
  socket.on("room:join", (room: unknown) => {
    if (typeof room === "string" && room.length > 0) {
      socket.join(room);
    }
  });
});

httpServer.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[backend] listening on :${env.PORT}`);
});

