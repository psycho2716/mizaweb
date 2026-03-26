import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-6 py-12">
      <h1 className="text-3xl font-semibold">Romblon Stone Marketplace</h1>
      <p className="max-w-2xl text-sm text-zinc-600">
        Production scaffold is ready. Use the links below to test core phase
        flows: verification gate, listings, admin review, and buyer discovery.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link className="rounded border p-4" href="/products">
          Browse Products
        </Link>
        <Link className="rounded border p-4" href="/seller/listings">
          Seller Listings
        </Link>
        <Link className="rounded border p-4" href="/seller/verification">
          Seller Verification
        </Link>
        <Link className="rounded border p-4" href="/admin/verifications">
          Admin Verification Queue
        </Link>
      </div>
    </main>
  );
}
