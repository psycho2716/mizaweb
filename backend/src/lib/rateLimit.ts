const buckets = new Map<string, { count: number; resetAt: number }>();

/**
 * Fixed-window rate limit. Returns true if under cap.
 */
export function rateLimitKey(key: string, max: number, windowMs: number): boolean {
    const now = Date.now();
    const b = buckets.get(key);
    if (!b || now >= b.resetAt) {
        buckets.set(key, { count: 1, resetAt: now + windowMs });
        return true;
    }
    if (b.count >= max) {
        return false;
    }
    b.count += 1;
    return true;
}
