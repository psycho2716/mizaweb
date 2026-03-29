"use client";

import { Suspense } from "react";
import { DirectMessagesClient } from "@/components/messaging/direct-messages-client";

function SellerMessagesInner() {
    return (
        <DirectMessagesClient
            mode="seller"
            heading="Messages"
            subheading="Reply to shoppers in real time. Open this page while you work so you do not miss new chats."
        />
    );
}

export default function SellerMessagesPage() {
    return (
        <Suspense
            fallback={
                <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-10 text-sm text-(--muted)">
                    Loading messages…
                </main>
            }
        >
            <SellerMessagesInner />
        </Suspense>
    );
}
