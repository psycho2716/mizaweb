export interface UserProfile {
  id: string;
  role: "admin" | "seller" | "customer";
  display_name: string | null;
}

