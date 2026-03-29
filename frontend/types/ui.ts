import type { InputHTMLAttributes, ReactNode } from "react";
import type { AuthUser } from "./auth";
import type { Product, SellerPublicProfile } from "./product";

/** Public shop catalog: Lithos-style grid, filters, sort, pagination. */
export interface ProductsListingClientProps {
  initialProducts: Product[];
}

export interface AdminConsoleShellProps {
  children: ReactNode;
  /** Highlighted sidebar item for this admin area. */
  activeNav?: "verifications" | "location-requests" | "users";
}

/** Seller console sidebar / mobile tab highlight. */
export type SellerConsoleActiveNav = "dashboard" | "products" | "orders" | "messages" | "profile";

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

/** Lithos-style label + bottom-border field (no boxed input). */
export interface LithosUnderlineFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "className"> {
  label: string;
  className?: string;
}

export interface ProfileAvatarEditorProps {
  imageUrl?: string;
  initials: string;
  onFileSelected: (file: File) => void;
  inputId: string;
  size?: "md" | "lg";
  className?: string;
  "aria-label"?: string;
}

/** Drop zone + click upload for profile / storefront imagery. */
export interface LithosImageUploaderProps {
  id: string;
  title: string;
  hint?: string;
  accept?: string;
  onFileSelected: (file: File) => void;
  /** Shown inside the zone (e.g. current banner preview). */
  previewUrl?: string;
  layout: "banner" | "tile";
  disabled?: boolean;
  className?: string;
}

/** Public seller storefront (client): hero, stats, map. */
export interface SellerStorefrontPublicViewProps {
  profile: SellerPublicProfile;
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

/** Product detail hero: gallery, 3D model, or listing video. */
export type ProductHeroMediaMode = "image" | "3d" | "video";

/** Lithos-style pill: one segment per available mode (order: image, 3d, video). */
export interface ProductViewModeToggleProps {
  modes: ProductHeroMediaMode[];
  active: ProductHeroMediaMode;
  onSelect: (mode: ProductHeroMediaMode) => void;
  className?: string;
}

/** Read-only map for admin views of a seller’s pinned shop. */
export interface AdminSellerLocationMapProps {
  latitude?: number;
  longitude?: number;
  /** Used for “Open in Google Maps” when coordinates are missing. */
  address?: string;
  className?: string;
  /** Label above the map (default: Shop location). */
  sectionHeading?: string;
  /** Tailwind classes for the map container (height, radius, border). */
  mapFrameClassName?: string;
  /** Set false when the parent already provides a section title (e.g. public storefront). */
  showSectionLabel?: boolean;
}
