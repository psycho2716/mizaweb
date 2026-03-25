import { getAppName } from "@/lib/utils";

import { SellerProfileClient } from "./seller-profile-client";

export default async function SellerPublicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <div className="min-h-screen p-8 bg-zinc-50">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-semibold">{getAppName()} — Seller</h1>
        <p className="text-sm text-zinc-600 mt-2">Public shop pin (approved sellers only).</p>
        <div className="mt-6">
          <SellerProfileClient sellerId={id} />
        </div>
      </div>
    </div>
  );
}
