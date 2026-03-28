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

function escapeRegexSegment(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Derives the object key inside the verification bucket from a stored permit URL
 * (signed upload URL, signed read URL, mock URL, or any path containing `/{bucket}/`).
 */
export function extractVerificationObjectPath(permitFileUrl: string): string | null {
  const bucket = env.SUPABASE_VERIFICATION_BUCKET;
  try {
    const url = new URL(permitFileUrl);
    const pathname = url.pathname;

    const marker = `/${bucket}/`;
    const pathStart = pathname.indexOf(marker);
    if (pathStart !== -1) {
      const objectPath = pathname.slice(pathStart + marker.length);
      if (objectPath.length > 0) {
        try {
          return decodeURIComponent(objectPath);
        } catch {
          return objectPath;
        }
      }
    }

    const b = escapeRegexSegment(bucket);
    const patterns = [
      new RegExp(`/storage/v1/object/upload/sign/${b}/(.+)$`),
      new RegExp(`/storage/v1/object/sign/${b}/(.+)$`),
      new RegExp(`/storage/v1/object/public/${b}/(.+)$`),
      new RegExp(`/storage/v1/object/authenticated/${b}/(.+)$`)
    ];
    for (const re of patterns) {
      const m = re.exec(pathname);
      if (m?.[1]) {
        try {
          return decodeURIComponent(m[1]);
        } catch {
          return m[1];
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

export async function createSignedVerificationDownloadUrl(
  objectPath: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return null;
  }
  const bucket = env.SUPABASE_VERIFICATION_BUCKET;
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(objectPath, expiresInSeconds);
  if (error || !data?.signedUrl) {
    console.error("[verification] createSignedUrl", error);
    return null;
  }
  return data.signedUrl;
}

export async function generateVerificationUploadTarget(
  sellerId: string,
  filename: string,
  kind: "verification" | "profile" | "background" | "payment-qr" = "verification",
): Promise<VerificationUploadTarget> {
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${sellerId}/${kind}/${Date.now()}-${safeFilename}`;

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

  const bucket = env.SUPABASE_VERIFICATION_BUCKET;
  const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(path);

  if (error || !data?.signedUrl) {
    console.error("[verification] createSignedUploadUrl", error);
    return {
      path,
      uploadUrl: `https://mock-upload.local/${bucket}/${path}`,
      expiresIn: 3600,
      provider: "mock",
    };
  }

  return {
    path,
    uploadUrl: data.signedUrl,
    expiresIn: 3600,
    provider: "supabase",
  };
}
