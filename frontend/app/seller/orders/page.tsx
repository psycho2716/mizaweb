"use client";

import { useEffect, useMemo, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    getOrderMessages,
    getOrders,
    sendOrderMessage,
    updateOrderStatus
} from "@/lib/api/endpoints";
import type { Order, OrderMessage } from "@/types";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

export default function SellerOrdersPage() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [activeOrderId, setActiveOrderId] = useState("");
    const [messages, setMessages] = useState<OrderMessage[]>([]);
    const [messageInput, setMessageInput] = useState("");

    const sortedOrders = useMemo(
        () => [...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        [orders]
    );

    async function handleStatusUpdate(
        orderId: string,
        status: "confirmed" | "processing" | "shipped" | "delivered"
    ) {
        await updateOrderStatus(orderId, status);
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
                return [...previous, message].sort((a, b) =>
                    a.createdAt.localeCompare(b.createdAt)
                );
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

    return (
        <main className="mx-auto max-w-5xl space-y-4 p-6">
            <Card>
                <CardHeader>
                    <CardTitle>Seller Orders</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                    {sortedOrders.map((order) => (
                        <div key={order.id} className="rounded border border-zinc-200 p-3 text-sm">
                            <p className="font-medium">{order.id}</p>
                            <p>Status: {order.status}</p>
                            <p>Payment: {order.paymentMethod}</p>
                            <p>Total: PHP {order.totalAmount}</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => void handleStatusUpdate(order.id, "confirmed")}
                                >
                                    Confirm
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => void handleStatusUpdate(order.id, "processing")}
                                >
                                    Processing
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => void handleStatusUpdate(order.id, "shipped")}
                                >
                                    Shipped
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => void handleStatusUpdate(order.id, "delivered")}
                                >
                                    Delivered
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    onClick={() => setActiveOrderId(order.id)}
                                >
                                    Open chat
                                </Button>
                            </div>
                        </div>
                    ))}
                    {sortedOrders.length === 0 ? (
                        <p className="text-sm text-zinc-600">No seller orders yet.</p>
                    ) : null}
                </CardContent>
            </Card>

            {activeOrderId ? (
                <Card>
                    <CardHeader>
                        <CardTitle>Buyer Chat: {activeOrderId}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="max-h-64 space-y-2 overflow-auto rounded border border-zinc-200 p-3 text-sm">
                            {messages.map((message) => (
                                <div key={message.id} className="rounded bg-zinc-100 p-2">
                                    <p className="font-medium">{message.senderId}</p>
                                    <p>{message.body}</p>
                                    <p className="text-xs text-zinc-500">
                                        {new Date(message.createdAt).toLocaleString()}
                                    </p>
                                </div>
                            ))}
                            {messages.length === 0 ? (
                                <p className="text-zinc-600">No messages yet.</p>
                            ) : null}
                        </div>
                        <div className="flex gap-2">
                            <input
                                className="h-10 flex-1 rounded-md border border-zinc-300 bg-white px-3 text-sm"
                                value={messageInput}
                                onChange={(event) => setMessageInput(event.target.value)}
                                placeholder="Reply to buyer..."
                            />
                            <Button type="button" onClick={() => void handleSendMessage()}>
                                Send
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            ) : null}
        </main>
    );
}
