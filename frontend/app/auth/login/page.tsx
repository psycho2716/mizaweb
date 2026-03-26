export default function LoginPage() {
  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-2xl font-semibold">Login</h1>
      <p className="mt-2 text-sm text-zinc-600">
        Demo users: <code>u-buyer-1</code>, <code>u-seller-1</code>,{" "}
        <code>u-admin-1</code>. Call backend <code>/auth/login</code> using the
        selected user id.
      </p>
    </main>
  );
}
