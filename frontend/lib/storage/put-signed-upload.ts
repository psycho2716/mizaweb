const DEFAULT_CACHE_CONTROL = "3600";

/**
 * PUT to a Supabase Storage signed upload URL from `createSignedUploadUrl`.
 * Uses the same multipart shape as @supabase/storage-js `uploadToSignedUrl` (cacheControl + file),
 * which browser raw PUT with a File body does not always satisfy.
 */
export async function putToSignedUploadUrl(
    uploadUrl: string,
    fileBody: Blob | File,
    options?: { upsert?: boolean; cacheControl?: string }
): Promise<Response> {
    const form = new FormData();
    form.append("cacheControl", options?.cacheControl ?? DEFAULT_CACHE_CONTROL);
    form.append("", fileBody);
    return fetch(uploadUrl, {
        method: "PUT",
        body: form,
        headers: {
            "x-upsert": String(options?.upsert ?? false)
        }
    });
}
