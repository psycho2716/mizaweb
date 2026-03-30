import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function getAppName(): string {
    return process.env.NEXT_PUBLIC_APP_NAME ?? "Mizaweb";
}

/** Public path to the app mark (see `frontend/public/images/logo.png`). */
export function getAppLogoSrc(): string {
    return "/images/logo.png";
}

/** Browser key for Maps JavaScript API (Places / map embeds). */
export function getGoogleMapsBrowserApiKey(): string {
    return process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ?? "";
}

/** Philippine peso for UI: peso sign (₱) + formatted amount. */
export function formatPeso(amount: number, options?: Intl.NumberFormatOptions): string {
    const merged: Intl.NumberFormatOptions = {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
        ...options
    };
    return `₱${amount.toLocaleString("en-PH", merged)}`;
}
