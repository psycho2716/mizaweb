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
    return <main className="p-6">Seller profile not found.</main>;
  }
  const payload = (await response.json()) as SellerProfileResponse;
  const profile = payload.data;

  return (
    <main className="mx-auto max-w-3xl p-6">
      <Card>
        <CardHeader>
          <CardTitle>{profile.businessName}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>Seller email: {profile.email}</p>
          <p>Contact: {profile.contactNumber}</p>
          <p>Address: {profile.address}</p>
          <p>Verification: {profile.verificationStatus}</p>
          <p>Published products: {profile.publishedProducts}</p>
        </CardContent>
      </Card>
    </main>
  );
}
