"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { SellerVerificationBanner } from "@/components/seller-verification-banner";
import { SellerConsoleShell } from "@/components/seller/seller-console-shell";
function resolveActiveNav(pathname: string) {
  if (pathname.startsWith("/seller/listings")) return "products";
  if (pathname.startsWith("/seller/orders")) return "orders";
  if (pathname.startsWith("/seller/profile") || pathname.startsWith("/seller/payment-methods")) {
    return "profile";
  }
  return "dashboard";
}

function resolveSectionTitle(pathname: string): string {
  if (pathname.startsWith("/seller/listings/") && pathname !== "/seller/listings") {
    return "Specimen editor";
  }
  if (pathname.startsWith("/seller/listings")) return "Stone manifest";
  if (pathname.startsWith("/seller/orders")) return "Order management";
  if (pathname.startsWith("/seller/profile") || pathname.startsWith("/seller/payment-methods")) {
    return "Profile settings";
  }
  return "Merchant dashboard";
}

export function SellerLayoutClient({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const activeNav = resolveActiveNav(pathname);
  const sectionTitle = resolveSectionTitle(pathname);

  return (
    <>
      <SellerVerificationBanner />
      <SellerConsoleShell activeNav={activeNav} sectionTitle={sectionTitle}>
        {children}
      </SellerConsoleShell>
    </>
  );
}
