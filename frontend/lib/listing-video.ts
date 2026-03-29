/**
 * Listing `videoUrl` may be a direct file (Supabase upload) or a hosted YouTube link.
 */

export type ListingVideoPlayerKind = "direct" | "youtube";

export function getListingVideoPlayerKind(url: string): ListingVideoPlayerKind {
    try {
        const u = new URL(url);
        if (/^(www\.)?youtube\.com$/i.test(u.hostname) || /^youtu\.be$/i.test(u.hostname)) {
            return "youtube";
        }
    } catch {
        /* invalid URL */
    }
    return "direct";
}

/** Returns embed URL for iframe, or null if not a parseable YouTube watch/shorts/share URL. */
export function listingYoutubeEmbedUrl(url: string): string | null {
    try {
        const u = new URL(url);
        const host = u.hostname.replace(/^www\./i, "");

        if (host === "youtu.be") {
            const id = u.pathname.replace(/^\//, "").split("/")[0];
            return id ? `https://www.youtube.com/embed/${id}` : null;
        }

        if (host === "youtube.com") {
            if (u.pathname.startsWith("/embed/")) {
                return url;
            }
            const v = u.searchParams.get("v");
            if (v) {
                return `https://www.youtube.com/embed/${v}`;
            }
            const shorts = u.pathname.match(/^\/shorts\/([^/?]+)/);
            if (shorts?.[1]) {
                return `https://www.youtube.com/embed/${shorts[1]}`;
            }
        }
    } catch {
        return null;
    }
    return null;
}

/** Embed URL with autoplay (muted) so in-hero playback works under browser policies. */
export function listingYoutubeEmbedUrlAutoplay(url: string): string | null {
    const base = listingYoutubeEmbedUrl(url);
    if (!base) {
        return null;
    }
    const sep = base.includes("?") ? "&" : "?";
    return `${base}${sep}autoplay=1&mute=1&rel=0`;
}
