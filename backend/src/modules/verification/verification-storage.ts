import { randomUUID } from "node:crypto";
import { env } from "../../config/env";
import {
  createSupabaseAdminClient,
  isSupabaseConfigured,
} from "../../integrations/supabase/client";

export interface VerificationUploadTarget {
  path: string;
  uploadUrl: string;
  expiresIn: number;
  provider: "supabase" | "mock";
}

export async function generateVerificationUploadTarget(
  sellerId: string,
  filename: string,
): Promise<VerificationUploadTarget> {
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${sellerId}/${Date.now()}-${safeFilename}`;

  if (!isSupabaseConfigured()) {
    return {
      path,
      uploadUrl: `https://mock-upload.local/${env.SUPABASE_VERIFICATION_BUCKET}/${path}`,
      expiresIn: 3600,
      provider: "mock",
    };
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return {
      path,
      uploadUrl: `https://mock-upload.local/${env.SUPABASE_VERIFICATION_BUCKET}/${path}`,
      expiresIn: 3600,
      provider: "mock",
    };
  }

  const token = randomUUID();
  const uploadUrl = `${env.SUPABASE_URL}/storage/v1/object/upload/sign/${env.SUPABASE_VERIFICATION_BUCKET}/${path}?token=${token}`;

  return {
    path,
    uploadUrl,
    expiresIn: 3600,
    provider: "supabase",
  };
}
