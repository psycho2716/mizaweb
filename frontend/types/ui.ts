import type { ReactNode } from "react";
import type { AuthUser } from "./auth";

export interface AdminConsoleShellProps {
  children: ReactNode;
  /** Highlighted sidebar item for this admin area. */
  activeNav?: "verifications" | "users";
}

/** Seller console sidebar / mobile tab highlight. */
export type SellerConsoleActiveNav = "dashboard" | "products" | "orders" | "profile";

export interface SellerConsoleShellProps {
  children: ReactNode;
  activeNav: SellerConsoleActiveNav;
  /** Top bar context label (e.g. Stone manifest, Specimen editor). */
  sectionTitle: string;
}

export interface AdminTablePaginationProps {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
  className?: string;
}

export interface ApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export interface UserProfileMenuProps {
  user: AuthUser;
  onLogout: () => void;
}

/** Options for the async confirmation dialog from `useConfirmDialog`. */
export interface ConfirmDialogOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Danger styling and default focus on cancel (safer for destructive actions). */
  destructive?: boolean;
}

export interface SellerShopMapPickerProps {
  latitude: number | undefined;
  longitude: number | undefined;
  onPositionChange: (lat: number, lng: number) => void;
  error?: string;
}

/** Read-only map for admin views of a seller’s pinned shop. */
export interface AdminSellerLocationMapProps {
  latitude?: number;
  longitude?: number;
  /** Used for “Open in Google Maps” when coordinates are missing. */
  address?: string;
  className?: string;
}
