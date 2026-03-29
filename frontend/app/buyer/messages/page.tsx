"use client";

import { Suspense } from "react";
import { DirectMessagesClient } from "@/components/messaging/direct-messages-client";

function BuyerMessagesInner() {
    return (
        <DirectMessagesClient
            mode="buyer"
            heading="Messages"
            subheading="Chat with sellers about products or orders. Replies appear instantly when you keep this page open."
        />
    );
}

export default function BuyerMessagesPage() {
    return (
        <Suspense
            fallback={
                <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-10 text-sm text-(--muted)">
                    Loading messages…
                </main>
            }
        >
            <BuyerMessagesInner />
        </Suspense>
    );
}
