import { env } from "../config/env";
import type { ProductMedia, ProductRecord } from "../types/domain";

/**
 * Rewrites http://127.0.0.1:<oldPort>/... or http://localhost:<oldPort>/... asset URLs to the
 * current SUPABASE_URL origin so stored rows survive local API port changes (e.g. Windows reserved ranges).
 */
export function rewriteLocalSupabaseUrl(url: string | undefined): string | undefined {
    if (!url?.trim() || !env.SUPABASE_URL?.trim()) {
        return url;
    }
    try {
        const u = new URL(url);
        if (u.hostname !== "127.0.0.1" && u.hostname !== "localhost") {
            return url;
        }
        const origin = new URL(env.SUPABASE_URL.trim()).origin;
        return `${origin}${u.pathname}${u.search}${u.hash}`;
    } catch {
        return url;
    }
}

export function rewriteProductRecordForClient(product: ProductRecord): ProductRecord {
    return {
        ...product,
        ...(product.model3dUrl
            ? { model3dUrl: rewriteLocalSupabaseUrl(product.model3dUrl) ?? product.model3dUrl }
            : {}),
        ...(product.videoUrl
            ? { videoUrl: rewriteLocalSupabaseUrl(product.videoUrl) ?? product.videoUrl }
            : {})
    };
}

export function rewriteProductMediaForClient(media: ProductMedia[]): ProductMedia[] {
    return media.map((m) => ({
        ...m,
        url: rewriteLocalSupabaseUrl(m.url) ?? m.url
    }));
}
