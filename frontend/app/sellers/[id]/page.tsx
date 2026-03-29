import Link from "next/link";
import type { SellerProfileResponse } from "@/types";
import { SellerStorefrontPublicView } from "@/components/sellers/seller-storefront-public-view";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

export default async function SellerProfilePage({
    params
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const response = await fetch(`${BACKEND_URL}/sellers/${id}/profile`, { cache: "no-store" });
    if (!response.ok) {
        return (
            <main className="flex min-h-[50vh] flex-1 flex-col items-center justify-center bg-[#050508] px-4 py-20 text-center">
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-(--accent)">
                    Storefront
                </p>
                <h1 className="mt-3 text-2xl font-bold text-foreground">Seller not found</h1>
                <p className="mt-2 max-w-sm text-sm text-(--muted)">
                    This shop link may be outdated, or the seller has not finished setup.
                </p>
                <Link
                    href="/products"
                    className="mt-8 inline-flex min-h-11 items-center bg-(--accent) px-6 text-xs font-bold uppercase tracking-[0.16em] text-[#030608]"
                >
                    Browse marketplace
                </Link>
            </main>
        );
    }
    const payload = (await response.json()) as SellerProfileResponse;

    return <SellerStorefrontPublicView profile={payload.data} />;
}
