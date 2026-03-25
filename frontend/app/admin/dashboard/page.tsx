import { getAppName } from "@/lib/utils";

export default function AdminDashboardPage() {
  return (
    <div className="min-h-screen p-8 bg-zinc-50">
      <h1 className="text-2xl font-semibold">{getAppName()} - Admin</h1>
      <p className="text-zinc-600 mt-2">Seller verification workflow will be added in Phase 1.</p>
    </div>
  );
}

