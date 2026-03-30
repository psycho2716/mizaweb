import { env } from "../../config/env";
import {
  createSupabaseAdminClient,
  isSupabaseConfigured,
} from "../../integrations/supabase/client";
import { rewriteLocalSupabaseUrl } from "../../lib/supabase-asset-url";

export interface VerificationUploadTarget {
  path: string;
  uploadUrl: string;
  /** Stable URL to persist after PUT (public bucket); omit when using private verification-docs. */
  publicUrl?: string;
  expiresIn: number;
  provider: "supabase" | "mock";
}

function isProductMediaKind(
  kind:
    | "verification"
    | "profile"
    | "background"
    | "payment-qr"
    | "payment-receipt"
    | "product-image"
    | "product-video"
    | "product-3d-model",
): boolean {
  return (
    kind === "product-image" ||
    kind === "product-video" ||
    kind === "product-3d-model"
  );
}

function storagePublicObjectUrl(bucket: string, objectPath: string): string | undefined {
  const base = env.SUPABASE_URL?.replace(/\/$/, "");
  if (!base) {
    return undefined;
  }
  const encodedPath = objectPath.split("/").map(encodeURIComponent).join("/");
  return `${base}/storage/v1/object/public/${bucket}/${encodedPath}`;
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

/** Stable URL shape stored in DB (public path); bucket may still be private — use signed URLs for display. */
export function getVerificationDocsCanonicalUrl(objectPath: string): string | undefined {
  return storagePublicObjectUrl(env.SUPABASE_VERIFICATION_BUCKET, objectPath);
}

export function mockVerificationDocsAssetUrl(objectPath: string): string {
  return `https://mock-upload.local/${env.SUPABASE_VERIFICATION_BUCKET}/${objectPath}`;
}

/**
 * Returns a time-limited signed URL for browser display when the stored value points at verification-docs.
 * External URLs and unrecognized shapes are returned unchanged.
 */
/** Collapse signed or public-path URLs to the canonical object URL for DB storage. */
export function normalizeVerificationDocsStoredUrl(
  url: string | undefined | null,
): string | undefined {
  if (url === undefined || url === null || !String(url).trim()) {
    return undefined;
  }
  const trimmed = String(url).trim();
  const path = extractVerificationObjectPath(trimmed);
  if (!path) {
    return trimmed;
  }
  return getVerificationDocsCanonicalUrl(path) ?? mockVerificationDocsAssetUrl(path);
}

export async function resolveVerificationDocsReadUrl(
  storedUrl: string | undefined | null,
  expiresInSeconds = 60 * 60 * 24 * 7,
): Promise<string | undefined> {
  if (storedUrl === undefined || storedUrl === null || !String(storedUrl).trim()) {
    return undefined;
  }
  const trimmed = String(storedUrl).trim();
  if (!isSupabaseConfigured()) {
    return trimmed;
  }
  const path = extractVerificationObjectPath(trimmed);
  if (!path) {
    return trimmed;
  }
  const signed = await createSignedVerificationDownloadUrl(path, expiresInSeconds);
  if (signed) {
    return signed;
  }
  const canonical = getVerificationDocsCanonicalUrl(path);
  return canonical ?? trimmed;
}

export async function generateVerificationUploadTarget(
  sellerId: string,
  filename: string,
  kind:
    | "verification"
    | "profile"
    | "background"
    | "payment-qr"
    | "payment-receipt"
    | "product-image"
    | "product-video"
    | "product-3d-model" = "verification",
  productId?: string,
): Promise<VerificationUploadTarget> {
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path =
    kind === "product-image" || kind === "product-video" || kind === "product-3d-model"
      ? `${sellerId}/product-media/${productId ?? "draft"}/${kind}/${Date.now()}-${safeFilename}`
      : `${sellerId}/${kind}/${Date.now()}-${safeFilename}`;

  const bucket = isProductMediaKind(kind)
    ? env.SUPABASE_PRODUCT_MEDIA_BUCKET
    : env.SUPABASE_VERIFICATION_BUCKET;

  const mockPublicUrl = (base: string): string | undefined => {
    if (isProductMediaKind(kind)) return base;
    if (
      kind === "profile" ||
      kind === "background" ||
      kind === "payment-qr" ||
      kind === "payment-receipt"
    ) {
      return base;
    }
    return undefined;
  };

  if (!isSupabaseConfigured()) {
    const mockBase = `https://mock-upload.local/${bucket}/${path}`;
    const publicUrl = mockPublicUrl(mockBase);
    return {
      path,
      uploadUrl: mockBase,
      ...(publicUrl ? { publicUrl } : {}),
      expiresIn: 3600,
      provider: "mock",
    };
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    const mockBase = `https://mock-upload.local/${bucket}/${path}`;
    const publicUrl = mockPublicUrl(mockBase);
    return {
      path,
      uploadUrl: mockBase,
      ...(publicUrl ? { publicUrl } : {}),
      expiresIn: 3600,
      provider: "mock",
    };
  }

  const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(path);

  if (error || !data?.signedUrl) {
    console.error("[verification] createSignedUploadUrl", error);
    const mockBase = `https://mock-upload.local/${bucket}/${path}`;
    const publicUrl = mockPublicUrl(mockBase);
    return {
      path,
      uploadUrl: mockBase,
      ...(publicUrl ? { publicUrl } : {}),
      expiresIn: 3600,
      provider: "mock",
    };
  }

  let publicUrl: string | undefined;
  if (isProductMediaKind(kind)) {
    publicUrl = storagePublicObjectUrl(bucket, path);
  } else if (
    kind === "profile" ||
    kind === "background" ||
    kind === "payment-qr" ||
    kind === "payment-receipt"
  ) {
    publicUrl = storagePublicObjectUrl(bucket, path);
  }

  const resolvedPublicUrl = publicUrl
    ? (rewriteLocalSupabaseUrl(publicUrl) ?? publicUrl)
    : undefined;

  return {
    path,
    uploadUrl: data.signedUrl,
    ...(resolvedPublicUrl ? { publicUrl: resolvedPublicUrl } : {}),
    expiresIn: 3600,
    provider: "supabase",
  };
}
