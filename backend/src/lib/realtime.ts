import type { Server as SocketServer } from "socket.io";
import { db } from "./store";
import type {
  ConversationMessageRecord,
  OrderMessage,
  OrderRecord
} from "../types/domain";

let io: SocketServer | null = null;

export function setRealtimeServer(server: SocketServer): void {
  io = server;
}

export function emitOrderUpdated(order: OrderRecord): void {
  if (!io) return;
  io.to(`order:${order.id}`).emit("order:updated", order);
  io.to(`user:${order.buyerId}`).emit("order:updated", order);
  io.to(`user:${order.sellerId}`).emit("order:updated", order);
}

export function emitOrderMessage(message: OrderMessage): void {
  if (!io) return;
  io.to(`order:${message.orderId}`).emit("chat:message", message);
  const order = db.orders.get(message.orderId);
  if (order) {
    io.to(`user:${order.buyerId}`).emit("chat:message", message);
    io.to(`user:${order.sellerId}`).emit("chat:message", message);
  }
}

export function emitDirectMessage(message: ConversationMessageRecord): void {
  if (!io) return;
  const conv = db.conversations.get(message.conversationId);
  io.to(`conversation:${message.conversationId}`).emit("direct:message", message);
  if (conv) {
    io.to(`user:${conv.buyerId}`).emit("direct:message", message);
    io.to(`user:${conv.sellerId}`).emit("direct:message", message);
  }
}
