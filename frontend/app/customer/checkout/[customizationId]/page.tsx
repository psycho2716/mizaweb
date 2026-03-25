import { getAppName } from "@/lib/utils";

import { CheckoutForm } from "./checkout-form";

export default async function CheckoutPage({ params }: { params: Promise<{ customizationId: string }> }) {
  const { customizationId } = await params;

  return (
    <div className="min-h-screen p-8 bg-zinc-50">
      <div className="max-w-xl mx-auto bg-white border border-zinc-200 rounded-xl p-6">
        <h1 className="text-2xl font-semibold">{getAppName()} — Checkout</h1>
        <p className="text-sm text-zinc-600 mt-2">MVP checkout: payment can remain stubbed for thesis.</p>
        <div className="mt-6">
          <CheckoutForm customizationId={customizationId} />
        </div>
      </div>
    </div>
  );
}
