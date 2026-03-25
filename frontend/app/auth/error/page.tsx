import Link from "next/link";

import type { AuthErrorPageProps } from "@/types";

export default function AuthErrorPage({
  searchParams,
}: AuthErrorPageProps) {
  const errorMessage = searchParams.error ?? "Authentication error.";

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-6">
      <div className="w-full max-w-md bg-white rounded-xl border border-zinc-200 p-6">
        <h1 className="text-2xl font-semibold">Login error</h1>
        <p className="text-zinc-600 mt-2">{errorMessage}</p>

        <Link
          href="/auth/login"
          className="mt-6 inline-flex items-center justify-center h-10 rounded-md bg-zinc-900 text-white hover:bg-zinc-800 px-4"
        >
          Back to login
        </Link>
      </div>
    </div>
  );
}

