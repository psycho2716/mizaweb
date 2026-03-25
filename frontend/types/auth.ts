export type UserRole = "admin" | "seller" | "customer";

export type SellerOrCustomerRole = Exclude<UserRole, "admin">;

export interface LoginFormData {
  email: string;
  password: string;
}

export interface RegisterFormData {
  fullName: string;
  email: string;
  password: string;
  role: SellerOrCustomerRole;
}

export interface ForgotPasswordFormData {
  email: string;
}

