export type UserRole = "buyer" | "seller" | "admin";

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}
