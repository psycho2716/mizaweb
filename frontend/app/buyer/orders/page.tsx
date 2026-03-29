/* eslint-disable @next/next/no-assign-module-variable */
"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getOrderMessages, getOrders, sendOrderMessage } from "@/lib/api/endpoints";
import { formatPeso } from "@/lib/utils";
import type { Order, OrderMessage } from "@/types";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

const fieldClass =
    "h-10 w-full rounded-md border border-(--border) bg-[#080b10] px-3 text-sm text-foreground placeholder:text-(--muted) focus-visible:border-(--accent)/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/25";

export default function BuyerOrdersPage() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [activeOrderId, setActiveOrderId] = useState("");
    const [messages, setMessages] = useState<OrderMessage[]>([]);
    const [messageInput, setMessageInput] = useState("");
    const activeOrderIdRef = useRef(activeOrderId);
    activeOrderIdRef.current = activeOrderId;

    const sortedOrders = useMemo(
        () => [...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        [orders]
    );

    async function refreshOrders() {
        try {
            const response = await getOrders();
            setOrders(response.data);
        } catch {
            setOrders([]);
        }
    }

    useEffect(() => {
        void refreshOrders();
        const token = localStorage.getItem("miza_token");
        const rawUser = localStorage.getItem("miza_user");
        const user = rawUser ? (JSON.parse(rawUser) as { id: string }) : null;
        const socket: Socket = io(BACKEND_URL, {
            transports: ["websocket"]
        });
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
            if (message.orderId !== activeOrderIdRef.current) {
                return;
            }
            setMessages((previous) => {
                if (previous.some((entry) => entry.id === message.id)) {
                    return previous;
                }
                return [...previous, message].sort((a, b) =>
                    a.createdAt.localeCompare(b.createdAt)
                );
            });
        });
        if (!token) {
            socket.disconnect();
        }

        return () => {
            socket.disconnect();
        };
    }, []);

    useEffect(() => {
        if (!activeOrderId) {
            setMessages([]);
            return;
        }
        getOrderMessages(activeOrderId)
            .then((response) => setMessages(response.data))
            .catch(() => setMessages([]));
    }, [activeOrderId]);

    async function handleSendMessage() {
        if (!activeOrderId || !messageInput.trim()) return;
        await sendOrderMessage(activeOrderId, messageInput.trim());
        setMessageInput("");
    }

    return (
        <main className="mx-auto w-full max-w-4xl flex-1 space-y-6 px-4 py-8 sm:px-6 lg:py-10">
            <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--accent)">
                    Orders & checkout
                </p>
                <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">
                    Your purchases
                </h1>
                <p className="mt-2 text-sm text-(--muted)">
                    Place new orders from your{" "}
                    <Link href="/cart" className="font-semibold text-(--accent) underline-offset-4 hover:underline">
                        cart
                    </Link>{" "}
                    or{" "}
                    <Link
                        href="/buyer/checkout"
                        className="font-semibold text-(--accent) underline-offset-4 hover:underline"
                    >
                        checkout
                    </Link>
                    . Track shipments and chat with the seller below.
                </p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>My orders</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    {sortedOrders.map((order) => (
                        <div
                            key={order.id}
                            className="rounded-lg border border-(--border) bg-[#080b10] p-4 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                        >
                            <p className="font-mono text-xs text-(--muted)">{order.id}</p>
                            <p className="mt-1 font-medium text-foreground">Status: {order.status}</p>
                            <p className="text-(--muted)">Payment: {order.paymentMethod}</p>
                            <p className="font-semibold text-(--accent)">
                                {formatPeso(order.totalAmount)}
                            </p>
                            <p className="text-xs text-(--muted)">
                                {new Date(order.createdAt).toLocaleString()}
                            </p>
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="mt-3"
                                onClick={() => setActiveOrderId(order.id)}
                            >
                                Open chat
                            </Button>
                        </div>
                    ))}
                    {sortedOrders.length === 0 ? (
                        <p className="text-sm text-(--muted)">No orders yet.</p>
                    ) : null}
                </CardContent>
            </Card>

            {activeOrderId ? (
                <Card>
                    <CardHeader>
                        <CardTitle className="font-mono text-base">Order chat · {activeOrderId}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="max-h-64 space-y-2 overflow-auto rounded-lg border border-(--border) bg-[#080b10] p-3 text-sm">
                            {messages.map((message) => (
                                <div
                                    key={message.id}
                                    className="rounded-md border border-(--border) bg-(--surface) p-2"
                                >
                                    <p className="text-xs font-semibold text-(--accent)">{message.senderId}</p>
                                    <p className="text-foreground">{message.body}</p>
                                    <p className="text-[10px] text-(--muted)">
                                        {new Date(message.createdAt).toLocaleString()}
                                    </p>
                                </div>
                            ))}
                            {messages.length === 0 ? (
                                <p className="text-(--muted)">No messages yet.</p>
                            ) : null}
                        </div>
                        <div className="flex gap-2">
                            <input
                                className={`${fieldClass} flex-1`}
                                value={messageInput}
                                onChange={(event) => setMessageInput(event.target.value)}
                                placeholder="Type your message to seller..."
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
