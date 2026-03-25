import Link from "next/link";

import { getAppName } from "@/lib/utils";

export default function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-6">
      <div className="w-full max-w-md bg-white rounded-xl border border-zinc-200 p-6">
        <h1 className="text-2xl font-semibold">{getAppName()}</h1>
        <p className="text-zinc-600 mt-2">
          AI-powered, customizable natural stone marketplace (Phase 0: Auth + secure catalog).
        </p>

        <div className="mt-6 flex flex-col gap-3">
          <Link
            href="/auth/login"
            className="h-10 inline-flex items-center justify-center rounded-md bg-zinc-900 text-white hover:bg-zinc-800"
          >
            Login
          </Link>
          <Link
            href="/auth/register"
            className="h-10 inline-flex items-center justify-center rounded-md border border-zinc-300 text-zinc-900 hover:bg-zinc-50"
          >
            Create account
          </Link>
        </div>
      </div>
    </div>
  );
}
