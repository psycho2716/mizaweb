import { redirect } from "next/navigation";

export default function SellerPaymentMethodsPage() {
    redirect("/seller/profile?tab=payments");
}
