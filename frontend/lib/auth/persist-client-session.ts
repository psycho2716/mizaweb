import type { AuthUser } from "@/types";

const REFRESH_STORAGE_KEY = "miza_refresh_token";

export function getStoredRefreshToken(): string | null {
    if (typeof window === "undefined") {
        return null;
    }
    const rt = window.localStorage.getItem(REFRESH_STORAGE_KEY);
    return rt && rt.length >= 10 ? rt : null;
}

export async function persistClientAuthSession(result: {
    token: string;
    user: AuthUser;
    refreshToken?: string;
}): Promise<void> {
    window.localStorage.setItem("miza_token", result.token);
    window.localStorage.setItem("miza_user", JSON.stringify(result.user));
    if (result.refreshToken && result.refreshToken.length >= 10) {
        window.localStorage.setItem(REFRESH_STORAGE_KEY, result.refreshToken);
    } else {
        window.localStorage.removeItem(REFRESH_STORAGE_KEY);
    }
    try {
        const res = await fetch("/api/auth/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: result.token, role: result.user.role })
        });
        if (!res.ok) {
            console.warn("[persistClientAuthSession] session cookie request failed", res.status);
        }
    } catch {
        /* network error — middleware may not see cookie until retry */
    }
    window.dispatchEvent(new Event("miza-auth-change"));
}

export function clearClientAuthStorage(): void {
    window.localStorage.removeItem("miza_token");
    window.localStorage.removeItem("miza_user");
    window.localStorage.removeItem(REFRESH_STORAGE_KEY);
}
