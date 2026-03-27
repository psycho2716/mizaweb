import { redirect } from "next/navigation";

export default function SellerVerificationRedirectPage() {
    redirect("/seller/dashboard");
}
