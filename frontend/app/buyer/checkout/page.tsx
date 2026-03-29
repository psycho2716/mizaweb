import { Suspense } from "react";
import { BuyerCheckoutClient } from "@/components/buyer/buyer-checkout-client";

export default function BuyerCheckoutPage() {
    return (
        <Suspense
            fallback={
                <main className="flex min-h-screen flex-1 items-center justify-center bg-[#050508] text-sm text-(--muted)">
                    Loading checkout…
                </main>
            }
        >
            <BuyerCheckoutClient />
        </Suspense>
    );
}
