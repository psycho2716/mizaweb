"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { SellerVerificationBanner } from "@/components/seller-verification-banner";
import { SellerConsoleShell } from "@/components/seller/seller-console-shell";
function resolveActiveNav(pathname: string) {
  if (pathname.startsWith("/seller/listings")) return "products";
  if (pathname.startsWith("/seller/orders")) return "orders";
  if (pathname.startsWith("/seller/messages")) return "messages";
  if (pathname.startsWith("/seller/profile") || pathname.startsWith("/seller/payment-methods")) {
    return "profile";
  }
  return "dashboard";
}

function resolveSectionTitle(pathname: string): string {
  if (pathname.startsWith("/seller/listings/") && pathname !== "/seller/listings") {
    return "Edit product";
  }
  if (pathname.startsWith("/seller/listings")) return "Products";
  if (pathname.startsWith("/seller/orders")) return "Orders";
  if (pathname.startsWith("/seller/messages")) return "Messages";
  if (pathname.startsWith("/seller/profile") || pathname.startsWith("/seller/payment-methods")) {
    return "Settings";
  }
  return "Seller dashboard";
}

export function SellerLayoutClient({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const activeNav = resolveActiveNav(pathname);
  const sectionTitle = resolveSectionTitle(pathname);

  return (
    <div className="flex h-dvh max-h-dvh min-h-0 flex-col overflow-hidden">
      <div className="shrink-0">
        <SellerVerificationBanner />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <SellerConsoleShell activeNav={activeNav} sectionTitle={sectionTitle}>
          {children}
        </SellerConsoleShell>
      </div>
    </div>
  );
}
