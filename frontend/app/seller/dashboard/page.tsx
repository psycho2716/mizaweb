import { getAppName } from "@/lib/utils";

import { SellerDashboardClient } from "./seller-dashboard-client";

export default function SellerDashboardPage() {
  return (
    <div className="min-h-screen p-8 bg-zinc-50">
      <h1 className="text-2xl font-semibold">{getAppName()} — Seller</h1>
      <p className="text-zinc-600 mt-2 max-w-2xl">
        Submit your business permit, pin your shop, then create products with one primary image and a customization template. Publishing requires admin
        approval of your permit.
      </p>
      <div className="mt-8">
        <SellerDashboardClient />
      </div>
    </div>
  );
}

