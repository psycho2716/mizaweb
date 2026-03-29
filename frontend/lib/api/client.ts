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

export async function apiFetch<T>(path: string, options?: RequestOptions): Promise<T> {
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
        const token = window.localStorage.getItem("miza_token");
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

    const response = await fetch(`${BACKEND_URL}${path}`, {
        ...options,
        headers,
        cache: "no-store"
    });

    let payload: unknown;
    try {
        payload = await response.json();
    } catch {
        payload = {};
    }

    if (!response.ok) {
        let message = "Request failed";
        let code: string | undefined;
        let cooldownEndsAt: string | undefined;
        if (payload && typeof payload === "object") {
            const body = payload as { error?: unknown; code?: unknown; cooldownEndsAt?: unknown };
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
        throw new ApiRequestError(message, response.status, code, cooldownEndsAt);
    }

    return payload as T;
}
