export type UserRole = "buyer" | "seller" | "admin";

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  fullName?: string;
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
