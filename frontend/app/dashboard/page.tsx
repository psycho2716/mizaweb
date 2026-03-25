import Link from "next/link";

import { getAppName } from "@/lib/utils";

export default function DashboardLandingPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-6">
      <div className="w-full max-w-md bg-white rounded-xl border border-zinc-200 p-6">
        <h1 className="text-2xl font-semibold">{getAppName()}</h1>
        <p className="text-zinc-600 mt-2">Redirecting based on your account role…</p>
        <Link className="underline mt-4 inline-block hover:text-zinc-900" href="/">
          Go back home
        </Link>
      </div>
    </div>
  );
}

