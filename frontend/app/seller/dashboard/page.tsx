import { getAppName } from "@/lib/utils";

export default function SellerDashboardPage() {
  return (
    <div className="min-h-screen p-8 bg-zinc-50">
      <h1 className="text-2xl font-semibold">{getAppName()} - Seller</h1>
      <p className="text-zinc-600 mt-2">Permit verification and product publishing will be added in Phase 1.</p>
    </div>
  );
}

