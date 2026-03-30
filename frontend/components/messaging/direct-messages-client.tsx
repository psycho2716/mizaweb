"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, MoreHorizontal, Paperclip, Search, ShoppingBag } from "lucide-react";
import { io, type Socket } from "socket.io-client";
import { cn } from "@/lib/utils";
import type { AuthUser, ConversationThread, DirectMessage } from "@/types";
import {
    createConversation,
    getDirectMessages,
    listConversations,
    sendDirectMessage
} from "@/lib/api/endpoints";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

function formatThreadTime(iso: string | undefined): string {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startMsg = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const diffDays = Math.round((startToday - startMsg) / 86400000);
    if (diffDays === 0) {
        return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    }
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return d.toLocaleDateString(undefined, { weekday: "short" });
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatMessageTime(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function dateKey(iso: string): string {
    const d = new Date(iso);
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function dateSeparatorLabel(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric"
    });
}

export interface DirectMessagesClientProps {
    mode: "buyer" | "seller";
    heading: string;
    subheading?: string;
    /** Outer width cap; use wide value for three-column inbox. */
    maxWidthClass?: string;
}

export function DirectMessagesClient({
    mode,
    heading,
    subheading,
    maxWidthClass = "max-w-[1600px]"
}: DirectMessagesClientProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const prefSeller = searchParams.get("seller");
    const prefBuyer = searchParams.get("buyer");

    const [user] = useState<AuthUser | null>(() => {
        // Avoid localStorage access during SSR and avoid calling setState in an effect body.
        if (typeof window === "undefined") {
            return null;
        }
        try {
            const raw = localStorage.getItem("miza_user");
            return raw ? (JSON.parse(raw) as AuthUser) : null;
        } catch {
            return null;
        }
    });
    const [threads, setThreads] = useState<ConversationThread[]>([]);
    const [filterQuery, setFilterQuery] = useState("");
    const [activeId, setActiveId] = useState("");
    const [messages, setMessages] = useState<DirectMessage[]>([]);
    const [input, setInput] = useState("");
    const [socketLive, setSocketLive] = useState(false);
    const activeIdRef = useRef("");
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        activeIdRef.current = activeId;
    }, [activeId]);

    const refreshThreads = useCallback(async () => {
        try {
            const res = await listConversations();
            setThreads(res.data);
            return res.data;
        } catch {
            setThreads([]);
            return [];
        }
    }, []);

    const filteredThreads = useMemo(() => {
        const q = filterQuery.trim().toLowerCase();
        if (!q) return threads;
        return threads.filter((t) => {
            const hay = [
                t.id,
                t.peerId,
                t.peerEmail,
                t.lastMessagePreview ?? "",
                t.buyerId,
                t.sellerId
            ]
                .join(" ")
                .toLowerCase();
            return hay.includes(q);
        });
    }, [threads, filterQuery]);

    const token = typeof window !== "undefined" ? localStorage.getItem("miza_token") : null;

    useEffect(() => {
        if (!token || !user) {
            return;
        }
        // Defer to avoid triggering state updates synchronously inside this effect.
        void Promise.resolve().then(() => refreshThreads());
    }, [token, user, refreshThreads]);

    useEffect(() => {
        if (!token || !user) {
            return;
        }
        const run = async () => {
            if (mode === "buyer" && prefSeller) {
                try {
                    const { data } = await createConversation({ sellerId: prefSeller });
                    setActiveId(data.id);
                    router.replace("/buyer/messages", { scroll: false });
                    await refreshThreads();
                } catch {
                    /* ignore */
                }
            } else if (mode === "seller" && prefBuyer) {
                try {
                    const { data } = await createConversation({ buyerId: prefBuyer });
                    setActiveId(data.id);
                    router.replace("/seller/messages", { scroll: false });
                    await refreshThreads();
                } catch {
                    /* ignore */
                }
            }
        };
        void run();
    }, [mode, prefSeller, prefBuyer, token, user, router, refreshThreads]);

    useEffect(() => {
        if (!activeId || !token) {
            // Defer state clearing to avoid synchronous setState inside this effect.
            void Promise.resolve().then(() => setMessages([]));
            return;
        }
        getDirectMessages(activeId)
            .then((r) => setMessages(r.data))
            .catch(() => setMessages([]));
    }, [activeId, token]);

    useEffect(() => {
        if (!token || !user?.id) {
            return;
        }
        const socket: Socket = io(BACKEND_URL, { transports: ["websocket"] });
        const onConnect = () => setSocketLive(true);
        const onDisconnect = () => setSocketLive(false);
        socket.on("connect", onConnect);
        socket.on("disconnect", onDisconnect);
        socket.emit("join:channel", `user:${user.id}`);
        if (activeId) {
            socket.emit("join:channel", `conversation:${activeId}`);
        }
        socket.on("direct:message", (msg: DirectMessage) => {
            void refreshThreads();
            if (msg.conversationId !== activeIdRef.current) {
                return;
            }
            setMessages((prev) => {
                if (prev.some((m) => m.id === msg.id)) {
                    return prev;
                }
                return [...prev, msg].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
            });
        });
        return () => {
            socket.off("connect", onConnect);
            socket.off("disconnect", onDisconnect);
            socket.disconnect();
            setSocketLive(false);
        };
    }, [token, user?.id, activeId, refreshThreads]);

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
    }, [messages, activeId]);

    async function handleSend() {
        if (!activeId || !input.trim()) {
            return;
        }
        try {
            await sendDirectMessage(activeId, input.trim());
            setInput("");
        } catch {
            /* optional toast */
        }
    }

    const activeThread = threads.find((t) => t.id === activeId);
    const peerLabel = mode === "buyer" ? "Seller" : "Shopper";
    const firstMessageAt = messages[0]?.createdAt;

    const messageRows = useMemo(() => {
        const sorted = [...messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        const rows: Array<{ type: "sep"; label: string } | { type: "msg"; msg: DirectMessage }> =
            [];
        let lastKey = "";
        for (const msg of sorted) {
            const k = dateKey(msg.createdAt);
            if (k !== lastKey) {
                lastKey = k;
                const n = rows.filter((r) => r.type === "sep").length;
                rows.push({
                    type: "sep",
                    label:
                        n === 0
                            ? `Chat started on ${dateSeparatorLabel(msg.createdAt)}`
                            : dateSeparatorLabel(msg.createdAt)
                });
            }
            rows.push({ type: "msg", msg });
        }
        return rows;
    }, [messages]);

    if (!token || !user) {
        const returnTo = pathname + (searchParams.toString() ? `?${searchParams.toString()}` : "");
        const signInHref = `/auth/login?callbackUrl=${encodeURIComponent(returnTo)}`;
        return (
            <main
                className={cn(
                    "mx-auto w-full flex-1 space-y-4 px-4 py-8 sm:px-6 lg:py-10",
                    maxWidthClass
                )}
            >
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">{heading}</h1>
                <p className="text-sm text-(--muted)">Sign in to read and send messages.</p>
                <Link
                    href={signInHref}
                    className="inline-flex h-10 items-center justify-center rounded-md border border-(--border) bg-transparent px-4 text-sm font-medium text-foreground hover:bg-[#12151c]"
                >
                    Sign in
                </Link>
            </main>
        );
    }

    if (user.role !== mode) {
        return (
            <main
                className={cn(
                    "mx-auto w-full flex-1 space-y-4 px-4 py-8 sm:px-6 lg:py-10",
                    maxWidthClass
                )}
            >
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">{heading}</h1>
                <p className="text-sm text-(--muted)">
                    This inbox is only available to your account type.
                </p>
                <Link
                    href="/"
                    className="inline-flex h-10 items-center justify-center rounded-md border border-(--border) bg-transparent px-4 text-sm font-medium text-foreground hover:bg-[#12151c]"
                >
                    Back home
                </Link>
            </main>
        );
    }

    return (
        <main className={cn("mx-auto w-full flex-1 px-4 py-6 sm:px-6 lg:py-8", maxWidthClass)}>
            <div className="mb-6 border-b border-(--border) pb-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-(--accent)">
                    Messages
                </p>
                <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                            {heading}
                        </h1>
                        {subheading ? (
                            <p className="mt-2 max-w-2xl text-sm text-(--muted)">{subheading}</p>
                        ) : null}
                    </div>
                    <div
                        className={cn(
                            "flex items-center gap-2 rounded-md border px-3 py-2 text-[10px] font-semibold uppercase tracking-wider",
                            socketLive
                                ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-200"
                                : "border-(--border) bg-[#080b10] text-(--muted)"
                        )}
                    >
                        <span
                            className={cn(
                                "h-1.5 w-1.5 rounded-full",
                                socketLive ? "animate-pulse bg-emerald-400" : "bg-(--muted)"
                            )}
                            aria-hidden
                        />
                        {socketLive ? "Active" : "Connecting…"}
                    </div>
                </div>
            </div>

            <div className="grid min-h-[min(640px,calc(100dvh-220px))] gap-0 overflow-hidden rounded-xl border border-white/[0.08] bg-[#080b10] lg:grid-cols-[minmax(0,300px)_1fr_minmax(0,280px)]">
                {/* Left: thread list */}
                <div className="flex flex-col border-b border-(--border) bg-[#0b0e14] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] lg:border-b-0 lg:border-r">
                    <div className="border-b border-(--border) px-3 py-3">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--muted)">
                            Inbox
                        </p>
                        <div className="relative mt-2">
                            <Search
                                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-(--muted)"
                                aria-hidden
                            />
                            <input
                                type="search"
                                value={filterQuery}
                                onChange={(e) => setFilterQuery(e.target.value)}
                                placeholder="Search by email, ID, or message…"
                                className="h-9 w-full rounded-md border border-(--border) bg-[#050608] py-2 pl-8 pr-3 text-xs text-foreground placeholder:text-(--muted) focus-visible:border-(--accent)/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--accent)/30"
                                aria-label="Filter conversations"
                            />
                        </div>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
                        {filteredThreads.map((t) => {
                            const active = t.id === activeId;
                            const timeSrc = t.lastMessageAt ?? t.updatedAt;
                            return (
                                <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => setActiveId(t.id)}
                                    className={cn(
                                        "flex w-full gap-3 border-b border-(--border) px-3 py-3 text-left transition-colors",
                                        active
                                            ? "bg-(--accent)/[0.07] shadow-[inset_3px_0_0_var(--accent)]"
                                            : "hover:bg-[#12151c]"
                                    )}
                                >
                                    <div className="min-w-0 flex-1">
                                        <p
                                            className={cn(
                                                "font-mono text-[10px] font-semibold uppercase tracking-wider",
                                                active ? "text-(--accent)" : "text-(--muted)"
                                            )}
                                        >
                                            {t.id.length > 18 ? `${t.id.slice(0, 14)}…` : t.id}
                                        </p>
                                        <p className="mt-1 truncate text-sm font-semibold text-foreground">
                                            {t.peerEmail || t.peerId}
                                        </p>
                                        <p className="mt-0.5 line-clamp-2 text-xs text-(--muted)">
                                            {t.lastMessagePreview ?? "No messages yet"}
                                        </p>
                                    </div>
                                    <span className="shrink-0 text-[10px] font-medium tabular-nums text-(--muted)">
                                        {formatThreadTime(timeSrc)}
                                    </span>
                                </button>
                            );
                        })}
                        {filteredThreads.length === 0 ? (
                            <p className="px-4 py-10 text-center text-sm text-(--muted)">
                                {threads.length === 0
                                    ? "No conversations yet. Open a product and use “Message seller” to start one."
                                    : "No matches. Try a different search."}
                            </p>
                        ) : null}
                    </div>
                </div>

                {/* Center: chat */}
                <div className="flex min-h-[320px] min-w-0 flex-col border-b border-(--border) lg:border-b-0 lg:border-r-0">
                    <div className="border-b border-(--border) px-4 py-3">
                        {activeThread ? (
                            <>
                                <div className="flex items-start justify-between gap-2">
                                    <div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h2 className="text-lg font-semibold tracking-tight text-foreground">
                                                {activeThread.peerEmail || activeThread.peerId}
                                            </h2>
                                            <span className="rounded border border-(--accent)/40 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-(--accent)">
                                                {peerLabel}
                                            </span>
                                        </div>
                                        <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.15em] text-(--muted)">
                                            Direct message · updates while this page is open
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        className="rounded-md p-2 text-(--muted) hover:bg-[#12151c] hover:text-foreground"
                                        aria-label="More options"
                                    >
                                        <MoreHorizontal className="h-4 w-4" />
                                    </button>
                                </div>
                            </>
                        ) : (
                            <p className="text-sm text-(--muted)">Select a conversation</p>
                        )}
                    </div>

                    <div
                        ref={scrollRef}
                        className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-y-contain px-4 py-4"
                    >
                        {!activeId ? (
                            <p className="py-12 text-center text-sm text-(--muted)">
                                Choose a thread from the list.
                            </p>
                        ) : messageRows.length === 0 ? (
                            <p className="py-12 text-center text-sm text-(--muted)">
                                No messages yet. Say hello below.
                            </p>
                        ) : (
                            messageRows.map((row, i) => {
                                if (row.type === "sep") {
                                    return (
                                        <div
                                            key={`sep-${row.label}-${i}`}
                                            className="flex items-center gap-3 py-2"
                                        >
                                            <div className="h-px flex-1 bg-(--border)" />
                                            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-(--muted)">
                                                {row.label}
                                            </span>
                                            <div className="h-px flex-1 bg-(--border)" />
                                        </div>
                                    );
                                }
                                const m = row.msg;
                                const mine = m.senderId === user.id;
                                return (
                                    <div
                                        key={m.id}
                                        className={cn(
                                            "flex",
                                            mine ? "justify-end" : "justify-start"
                                        )}
                                    >
                                        <div
                                            className={cn(
                                                "max-w-[min(100%,420px)] rounded-xl border px-3.5 py-2.5 text-sm",
                                                mine
                                                    ? "border-(--accent)/35 bg-(--accent)/[0.12] text-foreground shadow-[0_0_24px_rgba(34,199,243,0.08)]"
                                                    : "border-(--border) bg-[#12151c] text-foreground"
                                            )}
                                        >
                                            <p className="text-[10px] font-semibold uppercase tracking-wider text-(--accent)">
                                                {mine ? "You" : peerLabel}
                                            </p>
                                            <p className="mt-1 whitespace-pre-wrap leading-relaxed">
                                                {m.body}
                                            </p>
                                            <p className="mt-2 text-[10px] text-(--muted)">
                                                {formatMessageTime(m.createdAt)}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    <div className="border-t border-(--border) bg-[#0b0e14] px-3 py-3">
                        <div className="mb-2 flex flex-wrap gap-2">
                            <Link
                                href={mode === "buyer" ? "/buyer/orders" : "/seller/orders"}
                                className="inline-flex items-center gap-1.5 rounded-md border border-(--border) bg-[#080b10] px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-(--muted) transition-colors hover:border-(--accent)/30 hover:text-(--accent)"
                            >
                                <ShoppingBag className="h-3 w-3" aria-hidden />
                                Orders
                            </Link>
                            {mode === "buyer" ? (
                                <Link
                                    href={`/sellers/${activeThread?.sellerId ?? ""}`}
                                    className={cn(
                                        "inline-flex items-center rounded-md border border-(--border) bg-[#080b10] px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-(--muted) transition-colors hover:border-(--accent)/30 hover:text-(--accent)",
                                        !activeThread?.sellerId && "pointer-events-none opacity-40"
                                    )}
                                    aria-disabled={!activeThread?.sellerId}
                                >
                                    Storefront
                                </Link>
                            ) : null}
                        </div>
                        <div className="flex items-stretch gap-2">
                            <button
                                type="button"
                                disabled
                                title="File attachments are not available yet"
                                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-(--border) bg-[#050608] text-(--muted) disabled:cursor-not-allowed disabled:opacity-50"
                                aria-label="Attachments unavailable"
                            >
                                <Paperclip className="h-4 w-4" />
                            </button>
                            <input
                                className="min-w-0 flex-1 rounded-md border border-(--border) bg-[#050608] px-3 text-sm text-foreground placeholder:text-(--muted) focus-visible:border-(--accent)/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--accent)/30"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder="Type a message…"
                                disabled={!activeId}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey) {
                                        e.preventDefault();
                                        void handleSend();
                                    }
                                }}
                            />
                            <button
                                type="button"
                                onClick={() => void handleSend()}
                                disabled={!activeId || !input.trim()}
                                className={cn(
                                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-(--accent) text-[#050608] shadow-[0_0_20px_rgba(34,199,243,0.25)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                                )}
                                aria-label="Send message"
                            >
                                <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Right: details */}
                <div className="flex min-h-0 flex-col border-t border-(--border) bg-[#0b0e14] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] lg:border-t-0 lg:border-l">
                    <div className="border-b border-(--border) px-4 py-3">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--muted)">
                            Conversation details
                        </p>
                    </div>
                    <div className="flex-1 space-y-4 overflow-y-auto p-4 text-sm">
                        {activeThread ? (
                            <>
                                <dl className="space-y-3">
                                    <div className="flex justify-between gap-3 border-b border-(--border)/80 pb-3">
                                        <dt className="text-(--muted)">{peerLabel}</dt>
                                        <dd className="max-w-[60%] text-right text-xs font-medium text-foreground">
                                            {activeThread.peerEmail || "—"}
                                        </dd>
                                    </div>
                                    <div className="flex justify-between gap-3 border-b border-(--border)/80 pb-3">
                                        <dt className="text-(--muted)">Account ID</dt>
                                        <dd className="max-w-[60%] break-all text-right font-mono text-[10px] text-foreground">
                                            {activeThread.peerId}
                                        </dd>
                                    </div>
                                    <div className="flex justify-between gap-3 border-b border-(--border)/80 pb-3">
                                        <dt className="text-(--muted)">Thread ID</dt>
                                        <dd className="max-w-[60%] break-all text-right font-mono text-[10px] text-foreground">
                                            {activeThread.id}
                                        </dd>
                                    </div>
                                    <div className="flex justify-between gap-3 border-b border-(--border)/80 pb-3">
                                        <dt className="text-(--muted)">Last activity</dt>
                                        <dd className="text-right text-xs text-foreground">
                                            {formatThreadTime(
                                                activeThread.lastMessageAt ?? activeThread.updatedAt
                                            )}
                                        </dd>
                                    </div>
                                    <div className="flex justify-between gap-3 pb-1">
                                        <dt className="text-(--muted)">You are</dt>
                                        <dd className="text-right text-xs font-semibold text-(--accent)">
                                            {mode === "buyer" ? "Buyer" : "Seller"}
                                        </dd>
                                    </div>
                                </dl>
                                {firstMessageAt ? (
                                    <div className="rounded-lg border border-(--border) bg-[#080b10] p-3">
                                        <p className="text-[10px] font-semibold uppercase tracking-wider text-(--muted)">
                                            First message
                                        </p>
                                        <p className="mt-1 text-xs text-foreground">
                                            {dateSeparatorLabel(firstMessageAt)}
                                        </p>
                                    </div>
                                ) : null}
                                <p className="text-[10px] leading-relaxed text-(--muted)">
                                    For order-specific updates, use the chat on your order from the
                                    Orders page.
                                </p>
                            </>
                        ) : (
                            <p className="text-sm text-(--muted)">
                                Select a conversation to see details here.
                            </p>
                        )}
                    </div>
                </div>
            </div>

            <p className="mt-4 text-center text-[10px] text-(--muted)">
                Mizaweb messages · Plain language · Encrypted in transit (HTTPS)
            </p>
        </main>
    );
}
