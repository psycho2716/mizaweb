import type { AuthUser } from "./auth";

export interface ApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export interface UserProfileMenuProps {
  user: AuthUser;
  onLogout: () => void;
}
