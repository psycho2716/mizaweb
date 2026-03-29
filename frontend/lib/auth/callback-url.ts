/**
 * Returns a same-origin relative path safe to use after login/register, or null.
 */
export function parseSafeCallbackUrl(raw: string | null | undefined): string | null {
    if (raw == null || raw === "") {
        return null;
    }
    let decoded: string;
    try {
        decoded = decodeURIComponent(raw.trim());
    } catch {
        return null;
    }
    if (!decoded.startsWith("/")) {
        return null;
    }
    if (decoded.startsWith("//")) {
        return null;
    }
    if (decoded.includes("://")) {
        return null;
    }
    return decoded;
}

/**
 * Avoid sending sellers/admins to buyer-only routes (and vice versa) after auth.
 */
export function isCallbackAllowedForRole(path: string, role: string): boolean {
    if (
        path.startsWith("/products") ||
        path.startsWith("/sellers") ||
        path.startsWith("/cart") ||
        path === "/"
    ) {
        return true;
    }
    if (role === "buyer" && path.startsWith("/buyer")) {
        return true;
    }
    if (role === "seller" && path.startsWith("/seller")) {
        return true;
    }
    if (role === "admin" && path.startsWith("/admin")) {
        return true;
    }
    return false;
}
