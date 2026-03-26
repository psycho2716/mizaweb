import type { Server as SocketServer } from "socket.io";
import type { OrderMessage, OrderRecord } from "../types/domain";

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
}
