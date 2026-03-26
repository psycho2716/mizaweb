export default function SellerListingsPage() {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-semibold">Seller Listings</h1>
      <p className="mt-2 text-sm text-zinc-600">
        Use backend endpoints with seller user header <code>u-seller-1</code>.
      </p>
      <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm">
        <li>Create listing via POST /products.</li>
        <li>Submit verification via POST /seller/verification/submit.</li>
        <li>Admin approves via POST /admin/verifications/:id/approve.</li>
        <li>Publish via POST /products/:id/publish.</li>
      </ol>
    </main>
  );
}
