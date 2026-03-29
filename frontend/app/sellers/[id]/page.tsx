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
            <main className="flex flex-1 items-center justify-center bg-[#030406] px-4 py-16">
                <p className="text-(--muted)">Seller profile not found.</p>
            </main>
        );
    }
    const payload = (await response.json()) as SellerProfileResponse;

    return <SellerStorefrontPublicView profile={payload.data} />;
}
