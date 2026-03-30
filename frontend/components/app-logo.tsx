import Image from "next/image";
import { cn, getAppLogoSrc, getAppName } from "@/lib/utils";
import type { AppLogoProps, AppLogoSize } from "@/types";

const SIZE_PX: Record<AppLogoSize, number> = {
    xs: 24,
    sm: 32,
    md: 40,
    lg: 48,
    xl: 64,
    "2xl": 80,
    hero: 112
};

export function AppLogo({ className, size = "md", priority, title }: AppLogoProps) {
    const px = SIZE_PX[size];
    const alt = title ?? getAppName();
    return (
        <Image
            src={getAppLogoSrc()}
            alt={alt}
            width={px}
            height={px}
            className={cn("object-contain", className)}
            priority={priority}
            sizes={`${px}px`}
        />
    );
}
