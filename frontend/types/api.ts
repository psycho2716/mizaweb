export interface ApiError {
  error: string;
}

import type { AuthUser } from "./auth";
import type { Product } from "./product";
import type { VerificationSubmission } from "./admin";

export interface AuthLoginResponse {
  token: string;
  user: AuthUser;
}

export interface ProductsResponse {
  data: Product[];
}

export interface ProductCreateResponse {
  id: string;
}

export interface VerificationStatusResponse {
  status: string;
}

export interface VerificationSubmitResponse {
  id: string;
  status: "pending";
}

export interface VerificationQueueResponse {
  data: VerificationSubmission[];
}

export interface VerificationUploadTarget {
  path: string;
  uploadUrl: string;
  expiresIn: number;
  provider: "supabase" | "mock";
}
