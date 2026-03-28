import type { SellerProfileResponse } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

export default async function SellerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const response = await fetch(`${BACKEND_URL}/sellers/${id}/profile`, { cache: "no-store" });
  if (!response.ok) {
    return (
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <p className="text-(--muted)">Seller profile not found.</p>
      </main>
    );
  }
  const payload = (await response.json()) as SellerProfileResponse;
  const profile = payload.data;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 lg:py-10">
      <div className="mb-8">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--accent)">Storefront</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
          {profile.businessName}
        </h1>
        <p className="mt-2 text-sm text-(--muted)">Public seller profile on Mizaweb.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Contact & verification</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm leading-relaxed text-(--muted)">
          <p>
            <span className="font-semibold text-foreground">Email:</span> {profile.email}
          </p>
          <p>
            <span className="font-semibold text-foreground">Contact:</span> {profile.contactNumber}
          </p>
          <p>
            <span className="font-semibold text-foreground">Address:</span> {profile.address}
          </p>
          <p>
            <span className="font-semibold text-foreground">Verification:</span>{" "}
            <span className="text-(--accent)">{profile.verificationStatus}</span>
          </p>
          <p>
            <span className="font-semibold text-foreground">Published products:</span>{" "}
            {profile.publishedProducts}
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
