import type { ReactNode } from "react";
import { SellerVerificationBanner } from "@/components/seller-verification-banner";

export default function SellerLayout({ children }: { children: ReactNode }) {
    return (
        <>
            <SellerVerificationBanner />
            {children}
        </>
    );
}
