import { getStoredRefreshToken, persistClientAuthSession } from "@/lib/auth/persist-client-session";
import type { AuthLoginResponse } from "@/types";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

/** Thrown when `apiFetch` receives a non-OK response; includes optional `code` from JSON body (e.g. NSFW_REJECTED). */
export class ApiRequestError extends Error {
    readonly status: number;
    readonly code?: string;
    readonly cooldownEndsAt?: string;

    constructor(message: string, status: number, code?: string, cooldownEndsAt?: string) {
        super(message);
        this.name = "ApiRequestError";
        this.status = status;
        this.code = code;
        this.cooldownEndsAt = cooldownEndsAt;
    }
}

interface RequestOptions extends RequestInit {
    userId?: string;
    includeGuestSession?: boolean;
}

interface StoredUser {
    id: string;
}

function readMizaTokenFromCookie(): string | null {
    if (typeof document === "undefined") {
        return null;
    }
    const match = document.cookie.match(/(?:^|; )miza_token=([^;]*)/);
    if (!match?.[1]) {
        return null;
    }
    try {
        return decodeURIComponent(match[1].trim());
    } catch {
        return match[1].trim();
    }
}

function resolveBrowserAuthToken(): string | null {
    const ls = window.localStorage.getItem("miza_token");
    if (ls && ls.length >= 10) {
        return ls;
    }
    const fromCookie = readMizaTokenFromCookie();
    if (fromCookie && fromCookie.length >= 10) {
        return fromCookie;
    }
    return null;
}

function buildApiFetchHeaders(options?: RequestOptions): Headers {
    const headers = new Headers(options?.headers);
    headers.set("Content-Type", "application/json");
    if (options?.userId) {
        headers.set("x-user-id", options.userId);
    } else if (typeof window !== "undefined") {
        if (options?.includeGuestSession) {
            const guestSessionId = window.localStorage.getItem("miza_guest_session_id");
            if (guestSessionId) {
                headers.set("x-guest-session-id", guestSessionId);
            }
        }
        const token = resolveBrowserAuthToken();
        if (token) {
            headers.set("authorization", `Bearer ${token}`);
        } else {
            const rawUser = window.localStorage.getItem("miza_user");
            if (rawUser) {
                try {
                    const user = JSON.parse(rawUser) as StoredUser;
                    if (user.id) {
                        headers.set("x-user-id", user.id);
                    }
                } catch {
                    // Ignore malformed local storage values.
                }
            }
        }
    }
    return headers;
}

async function tryRefreshAuthSession(): Promise<boolean> {
    const rt = getStoredRefreshToken();
    if (!rt) {
        return false;
    }
    try {
        const res = await fetch(`${BACKEND_URL}/auth/refresh`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refreshToken: rt }),
            cache: "no-store"
        });
        const payload = (await res.json().catch(() => ({}))) as Partial<AuthLoginResponse>;
        if (!res.ok || typeof payload.token !== "string" || !payload.user) {
            return false;
        }
        await persistClientAuthSession({
            token: payload.token,
            user: payload.user,
            refreshToken: payload.refreshToken
        });
        return true;
    } catch {
        return false;
    }
}

function shouldAttemptSessionRefresh(path: string, status: number, attempt: number): boolean {
    return (
        status === 401 &&
        attempt === 0 &&
        typeof window !== "undefined" &&
        path !== "/auth/refresh" &&
        path !== "/auth/login" &&
        path !== "/auth/register"
    );
}

export async function apiFetch<T>(path: string, options?: RequestOptions): Promise<T> {
    let lastStatus = 500;
    let lastPayload: unknown = {};

    for (let attempt = 0; attempt < 2; attempt++) {
        const headers = buildApiFetchHeaders(options);
        const response = await fetch(`${BACKEND_URL}${path}`, {
            ...options,
            headers,
            cache: "no-store"
        });
        lastStatus = response.status;

        let payload: unknown;
        try {
            payload = await response.json();
        } catch {
            payload = {};
        }
        lastPayload = payload;

        if (response.ok) {
            return payload as T;
        }

        if (shouldAttemptSessionRefresh(path, response.status, attempt)) {
            const refreshed = await tryRefreshAuthSession();
            if (refreshed) {
                continue;
            }
        }

        break;
    }

    let message = "Request failed";
    let code: string | undefined;
    let cooldownEndsAt: string | undefined;
    if (lastPayload && typeof lastPayload === "object") {
        const body = lastPayload as { error?: unknown; code?: unknown; cooldownEndsAt?: unknown };
        if (typeof body.error === "string") {
            message = body.error;
        } else if (body.error !== undefined) {
            message = "Something went wrong. Please try again.";
        }
        if (typeof body.code === "string") {
            code = body.code;
        }
        if (typeof body.cooldownEndsAt === "string") {
            cooldownEndsAt = body.cooldownEndsAt;
        }
    }
    throw new ApiRequestError(message, lastStatus, code, cooldownEndsAt);
}
