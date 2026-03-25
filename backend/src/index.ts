import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import http from "http";
import { Server as SocketIOServer } from "socket.io";

import { env } from "./lib/env";
import { attachIo } from "./lib/socketBus";
import { createAnonSupabaseClient } from "./lib/supabase";
import { aiRouter } from "./routes/ai";
import { adminRouter } from "./routes/admin";
import { catalogRouter } from "./routes/catalog";
import { customizationsRouter } from "./routes/customizations";
import { guidanceRouter } from "./routes/guidance";
import { mapsRouter } from "./routes/maps";
import { ordersRouter } from "./routes/orders";
import { sellerRouter } from "./routes/seller";

const app = express();

app.use(helmet());
app.use(express.json({ limit: "1mb" }));
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(morgan("dev"));

app.get("/healthz", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get("/readyz", async (_req, res) => {
  try {
    const supabase = createAnonSupabaseClient();
    const { error } = await supabase.from("profiles").select("id").limit(1);
    if (error) {
      res.status(503).json({ status: "not_ready", error: error.message });
      return;
    }
    res.status(200).json({ status: "ready" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    res.status(503).json({ status: "not_ready", error: msg });
  }
});

app.use("/products", catalogRouter);
app.use("/customizations", customizationsRouter);
app.use("/orders", ordersRouter);
app.use("/seller", sellerRouter);
app.use("/admin", adminRouter);
app.use("/maps", mapsRouter);
app.use("/guidance", guidanceRouter);
app.use("/ai/2d-to-3d", aiRouter);

const httpServer = http.createServer(app);

const io = new SocketIOServer(httpServer, {
  cors: { origin: env.CORS_ORIGIN, credentials: true },
});

attachIo(io);

io.on("connection", (socket) => {
  socket.on("room:join", (room: unknown) => {
    if (typeof room === "string" && room.length > 0) {
      void socket.join(room);
    }
  });
});

httpServer.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[backend] listening on :${env.PORT}`);
});
