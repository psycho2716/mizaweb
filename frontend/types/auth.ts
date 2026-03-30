export type UserRole = "buyer" | "seller" | "admin";

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  fullName?: string;
  /** Portrait URL (stored in Supabase user_metadata for buyers). */
  profileImageUrl?: string;
  /** Digits-only; used for checkout and seller contact. */
  contactNumber?: string;
  shippingAddressLine?: string;
  shippingCity?: string;
  /** Digits-only postal / ZIP. */
  shippingPostalCode?: string;
  suspended?: boolean;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterPayload extends LoginCredentials {
  role: Exclude<UserRole, "admin">;
  fullName?: string;
  businessName?: string;
  contactNumber?: string;
  address?: string;
}
