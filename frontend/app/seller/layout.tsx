import type { ReactNode } from "react";
import { SellerLayoutClient } from "@/components/seller/seller-layout-client";

export default function SellerLayout({ children }: { children: ReactNode }) {
  return <SellerLayoutClient>{children}</SellerLayoutClient>;
}
