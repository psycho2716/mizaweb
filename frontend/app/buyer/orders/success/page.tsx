import { Suspense } from "react";
import { BuyerOrderSuccessClient } from "@/components/buyer/buyer-order-success-client";

export default function BuyerOrderSuccessPage() {
    return (
        <Suspense
            fallback={
                <main className="flex min-h-screen flex-1 items-center justify-center bg-[#050508] text-sm text-(--muted)">
                    Loading…
                </main>
            }
        >
            <BuyerOrderSuccessClient />
        </Suspense>
    );
}
