"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { AdminTablePagination } from "@/components/admin/admin-table-pagination";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getOrderMessages,
  getOrders,
  requestReceiptResubmission,
  sendOrderMessage,
  updateOrderPaymentStatus,
  updateOrderStatus,
} from "@/lib/api/endpoints";
import { formatSellerEnumLabel, SELLER_ORDER_STATUS_LABEL } from "@/lib/seller-display";
import { cn } from "@/lib/utils";
import type { Order, OrderMessage } from "@/types";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

const PAGE_SIZE = 5;

const inputDark =
  "h-9 w-full rounded-md border border-(--border) bg-[#080b10] px-3 text-xs text-foreground placeholder:text-(--muted)";
const btnPrimary =
  "bg-(--accent) font-semibold uppercase tracking-wide text-[#050608] hover:bg-(--accent)/90";
const btnOutline =
  "border-(--border) bg-transparent text-foreground hover:bg-(--surface-elevated)";

function statusDotClass(status: Order["status"]): string {
  switch (status) {
    case "created":
      return "bg-(--accent)";
    case "confirmed":
    case "processing":
      return "bg-amber-400";
    case "shipped":
      return "bg-foreground";
    case "delivered":
      return "bg-(--muted)";
    default:
      return "bg-(--muted)";
  }
}

export default function SellerOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeOrderId, setActiveOrderId] = useState("");
  const [messages, setMessages] = useState<OrderMessage[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [receiptNoteByOrder, setReceiptNoteByOrder] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);

  const sortedOrders = useMemo(
    () => [...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [orders],
  );

  const totalPages = Math.max(1, Math.ceil(sortedOrders.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageSlice = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return sortedOrders.slice(start, start + PAGE_SIZE);
  }, [sortedOrders, safePage]);

  const activeOrdersCount = useMemo(
    () => orders.filter((o) => o.status !== "delivered").length,
    [orders],
  );

  function canTransition(order: Order, target: "confirmed" | "shipped" | "delivered"): boolean {
    if (target === "confirmed") return order.status === "created";
    if (target === "shipped") return order.status === "confirmed" || order.status === "processing";
    if (target === "delivered") return order.status === "shipped";
    return false;
  }

  async function handleStatusUpdate(
    orderId: string,
    status: "confirmed" | "processing" | "shipped" | "delivered",
  ) {
    await updateOrderStatus(orderId, status);
    const response = await getOrders();
    setOrders(response.data);
  }

  async function handlePaymentStatus(orderId: string, paymentStatus: "pending" | "paid") {
    await updateOrderPaymentStatus(orderId, paymentStatus);
    const response = await getOrders();
    setOrders(response.data);
  }

  async function handleReceiptRequest(orderId: string) {
    const note = receiptNoteByOrder[orderId]?.trim();
    if (!note) return;
    await requestReceiptResubmission(orderId, note);
    const response = await getOrders();
    setOrders(response.data);
  }

  async function handleSendMessage() {
    if (!activeOrderId || !messageInput.trim()) return;
    await sendOrderMessage(activeOrderId, messageInput.trim());
    setMessageInput("");
  }

  useEffect(() => {
    getOrders()
      .then((response) => {
        setOrders(response.data);
      })
      .catch(() => {
        setOrders([]);
      });
    const rawUser = localStorage.getItem("miza_user");
    const user = rawUser ? (JSON.parse(rawUser) as { id: string }) : null;
    const socket: Socket = io(BACKEND_URL, { transports: ["websocket"] });
    if (user?.id) {
      socket.emit("join:channel", `user:${user.id}`);
    }
    socket.on("order:updated", (order: Order) => {
      setOrders((previous) => {
        const existing = previous.find((entry) => entry.id === order.id);
        if (existing) {
          return previous.map((entry) => (entry.id === order.id ? order : entry));
        }
        return [order, ...previous];
      });
    });
    socket.on("chat:message", (message: OrderMessage) => {
      setMessages((previous) => {
        if (previous.some((entry) => entry.id === message.id)) {
          return previous;
        }
        return [...previous, message].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      });
    });
    return () => {
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!activeOrderId) {
      return;
    }
    getOrderMessages(activeOrderId)
      .then((response) => setMessages(response.data))
      .catch(() => setMessages([]));
  }, [activeOrderId]);

  function renderOrderActions(order: Order) {
    return (
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={btnOutline}
          onClick={() => void handleStatusUpdate(order.id, "confirmed")}
          disabled={!canTransition(order, "confirmed")}
        >
          Confirm
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={btnOutline}
          onClick={() => void handleStatusUpdate(order.id, "shipped")}
          disabled={!canTransition(order, "shipped")}
        >
          Shipped
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={btnOutline}
          onClick={() => void handleStatusUpdate(order.id, "delivered")}
          disabled={!canTransition(order, "delivered")}
        >
          Delivered
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={btnOutline}
          onClick={() => void handlePaymentStatus(order.id, "paid")}
          disabled={order.paymentStatus === "paid"}
        >
          Mark paid
        </Button>
        <Button type="button" size="sm" className={btnPrimary} onClick={() => setActiveOrderId(order.id)}>
          Open chat
        </Button>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--accent)">
            Logistics
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Order management</h1>
          <p className="mt-1 text-sm text-(--muted)">
            Real-time fulfillment, payments, and buyer messaging.
          </p>
        </div>
        <div className="flex gap-2">
          <div className="rounded-lg border border-(--border) bg-(--surface) px-4 py-3 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-(--muted)">Active orders</p>
            <p className="text-2xl font-semibold tabular-nums text-(--accent)">{activeOrdersCount}</p>
          </div>
          <div className="rounded-lg border border-(--border) bg-(--surface) px-4 py-3 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-(--muted)">Total</p>
            <p className="text-2xl font-semibold tabular-nums text-foreground">{sortedOrders.length}</p>
          </div>
        </div>
      </div>

      <div className="hidden overflow-hidden rounded-lg border border-(--border) md:block">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="border-b border-(--border) bg-(--surface-elevated) text-[10px] font-semibold uppercase tracking-wider text-(--muted)">
            <tr>
              <th className="px-4 py-3">Order ID</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Payment</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageSlice.map((order) => (
              <Fragment key={order.id}>
                <tr className="border-b border-(--border) bg-(--surface)">
                  <td className="px-4 py-3 font-mono text-xs text-foreground">{order.id}</td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2">
                      <span className={cn("h-2 w-2 shrink-0 rounded-sm", statusDotClass(order.status))} />
                      <span className="text-xs font-semibold tracking-wide">
                        {SELLER_ORDER_STATUS_LABEL[order.status]}
                      </span>
                    </span>
                    <p className="mt-1 text-[10px] text-(--muted)">
                      Receipt: {formatSellerEnumLabel(order.receiptStatus)}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <span className="font-semibold uppercase tracking-wide text-(--muted)">
                      {formatSellerEnumLabel(order.paymentMethod)}
                    </span>
                    <span className="mx-1 text-(--border)">·</span>
                    <span
                      className={cn(
                        "font-semibold uppercase tracking-wide",
                        order.paymentStatus === "paid" ? "text-emerald-400" : "text-amber-300",
                      )}
                    >
                      {formatSellerEnumLabel(order.paymentStatus)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">
                    PHP {order.totalAmount.toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap justify-end gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className={cn(btnOutline, "h-8 text-[10px]")}
                        onClick={() => void handleStatusUpdate(order.id, "confirmed")}
                        disabled={!canTransition(order, "confirmed")}
                      >
                        Confirm
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className={cn(btnOutline, "h-8 text-[10px]")}
                        onClick={() => void handleStatusUpdate(order.id, "shipped")}
                        disabled={!canTransition(order, "shipped")}
                      >
                        Ship
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className={cn(btnOutline, "h-8 text-[10px]")}
                        onClick={() => void handleStatusUpdate(order.id, "delivered")}
                        disabled={!canTransition(order, "delivered")}
                      >
                        Deliver
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className={cn(btnPrimary, "h-8 text-[10px]")}
                        onClick={() => setActiveOrderId(order.id)}
                      >
                        Chat
                      </Button>
                    </div>
                  </td>
                </tr>
                {order.paymentMethod === "online" ? (
                  <tr className="border-b border-(--border) bg-[#080b10]">
                    <td colSpan={5} className="px-4 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          className={cn(inputDark, "max-w-md flex-1")}
                          value={receiptNoteByOrder[order.id] ?? ""}
                          onChange={(event) =>
                            setReceiptNoteByOrder((previous) => ({
                              ...previous,
                              [order.id]: event.target.value,
                            }))
                          }
                          placeholder="Request another receipt (reason)"
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className={btnOutline}
                          onClick={() => void handleReceiptRequest(order.id)}
                        >
                          Request new receipt
                        </Button>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
        {pageSlice.length === 0 ? (
          <p className="p-6 text-sm text-(--muted)">No seller orders yet.</p>
        ) : null}
        <AdminTablePagination
          page={safePage}
          totalPages={totalPages}
          total={sortedOrders.length}
          limit={PAGE_SIZE}
          onPageChange={setPage}
          disabled={false}
        />
      </div>

      <div className="space-y-3 md:hidden">
        {pageSlice.map((order) => (
          <div
            key={order.id}
            className="rounded-lg border border-(--border) bg-(--surface) p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-mono text-xs text-foreground">{order.id}</p>
              <span className="tabular-nums text-sm font-semibold text-(--accent)">
                PHP {order.totalAmount.toLocaleString()}
              </span>
            </div>
            <p className="mt-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
              <span className={cn("h-2 w-2 shrink-0 rounded-sm", statusDotClass(order.status))} />
              {SELLER_ORDER_STATUS_LABEL[order.status]}
            </p>
            <p className="mt-1 text-[10px] text-(--muted)">
              {formatSellerEnumLabel(order.paymentMethod)} · {formatSellerEnumLabel(order.paymentStatus)}
            </p>
            <p className="text-[10px] text-(--muted)">Receipt: {formatSellerEnumLabel(order.receiptStatus)}</p>
            {order.receiptRequestNote ? (
              <p className="mt-1 text-[10px] text-(--muted)">Note: {order.receiptRequestNote}</p>
            ) : null}
            {renderOrderActions(order)}
            {order.paymentMethod === "online" ? (
              <div className="mt-2 grid gap-2 border-t border-(--border) pt-2">
                <input
                  className={inputDark}
                  value={receiptNoteByOrder[order.id] ?? ""}
                  onChange={(event) =>
                    setReceiptNoteByOrder((previous) => ({
                      ...previous,
                      [order.id]: event.target.value,
                    }))
                  }
                  placeholder="Request another receipt (reason)"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className={btnOutline}
                  onClick={() => void handleReceiptRequest(order.id)}
                >
                  Request new receipt
                </Button>
              </div>
            ) : null}
          </div>
        ))}
        {pageSlice.length === 0 ? (
          <p className="text-sm text-(--muted)">No seller orders yet.</p>
        ) : null}
        <AdminTablePagination
          className="rounded-lg border border-(--border)"
          page={safePage}
          totalPages={totalPages}
          total={sortedOrders.length}
          limit={PAGE_SIZE}
          onPageChange={setPage}
          disabled={false}
        />
      </div>

      {activeOrderId ? (
        <Card className="mt-6 border-(--border) bg-(--surface) text-foreground">
          <CardHeader className="border-b border-(--border)">
            <CardTitle className="border-l-2 border-(--accent) pl-3 text-base font-semibold uppercase tracking-wide">
              Secure terminal · {activeOrderId}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-4">
            <div className="max-h-64 space-y-2 overflow-auto rounded-md border border-(--border) bg-[#080b10] p-3 text-sm">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className="rounded-md border border-(--border) bg-(--surface-elevated) p-2 text-xs"
                >
                  <p className="font-medium text-(--accent)">{message.senderId}</p>
                  <p className="text-foreground">{message.body}</p>
                  <p className="text-[10px] text-(--muted)">
                    {new Date(message.createdAt).toLocaleString()}
                  </p>
                </div>
              ))}
              {messages.length === 0 ? <p className="text-(--muted)">No messages yet.</p> : null}
            </div>
            <div className="flex gap-2">
              <input
                className={cn(inputDark, "h-10 flex-1 text-sm")}
                value={messageInput}
                onChange={(event) => setMessageInput(event.target.value)}
                placeholder="Type message to client…"
              />
              <Button type="button" className={btnPrimary} onClick={() => void handleSendMessage()}>
                Send
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
