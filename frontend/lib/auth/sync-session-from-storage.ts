/**
 * Keeps Next.js middleware cookies aligned with client auth storage.
 * API calls use `Authorization` from localStorage; `/buyer/*` protection uses `miza_token` / `miza_role` cookies.
 * If cookies are missing (cleared, or session POST failed), navigation to buyer routes would redirect to login
 * while the UI still shows a signed-in user.
 */
export function syncMizaSessionCookieFromStorage(): void {
    if (typeof window === "undefined") {
        return;
    }
    const token = window.localStorage.getItem("miza_token");
    if (!token || token.length < 10) {
        return;
    }
    const raw = window.localStorage.getItem("miza_user");
    if (!raw) {
        return;
    }
    let role: string | undefined;
    try {
        const u = JSON.parse(raw) as { role?: string };
        role = u.role;
    } catch {
        return;
    }
    if (role !== "buyer" && role !== "seller" && role !== "admin") {
        return;
    }
    void fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, role })
    }).catch(() => {
        /* ignore */
    });
}
