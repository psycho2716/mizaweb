import { getAppName } from "@/lib/utils";

import { AdminDashboardClient } from "./admin-dashboard-client";

export default function AdminDashboardPage() {
  return (
    <div className="min-h-screen p-8 bg-zinc-50">
      <h1 className="text-2xl font-semibold">{getAppName()} — Admin</h1>
      <p className="text-zinc-600 mt-2">Review pending seller permits. Approved sellers may publish products.</p>
      <div className="mt-8 max-w-2xl">
        <AdminDashboardClient />
      </div>
    </div>
  );
}

