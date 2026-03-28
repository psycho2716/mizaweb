import { fal } from "@fal-ai/client";
import { env } from "../config/env";

function configureFal(): void {
    const key = env.FAL_API_KEY;
    if (!key) {
        throw new Error("FAL_API_KEY is not configured on the server");
    }
    fal.config({ credentials: key });
}

type Trellis2Output = {
    model_glb?: { url?: string };
};

/**
 * Fal Trellis 2 — image → textured GLB. Quality-first preset: higher internal resolution, denser
 * mesh, 4K textures, extra sampling steps (slower runs, larger downloads vs. a “web lite” preset).
 */
async function runTrellis2(imageUrl: string): Promise<string> {
    const result = await fal.subscribe("fal-ai/trellis-2", {
        input: {
            image_url: imageUrl,
            /** Max pipeline resolution — more geometric detail, longer GPU time. */
            resolution: 1536,
            /** ~half of Fal default 500k: strong detail while keeping GLB under ~tens of MB typical. */
            decimation_target: 240_000,
            texture_size: 4096,
            remesh: true,
            /** Default Fal steps = 12; bump for cleaner shape and texture. */
            ss_sampling_steps: 18,
            shape_slat_sampling_steps: 18,
            tex_slat_sampling_steps: 18,
            /** Slightly stronger image adherence for sculptural subjects (busts, products). */
            shape_slat_guidance_strength: 8
        }
    });

    const data = result.data as Trellis2Output | undefined;
    const url = data?.model_glb?.url;
    if (!url) {
        throw new Error("Fal Trellis 2 did not return a 3D model URL");
    }
    return url;
}

/**
 * Runs Fal `fal-ai/trellis-2` to produce a downloadable GLB from a public image URL.
 * Requires `FAL_API_KEY` in the backend environment.
 */
export async function generateGlbUrlFromImageUrl(imageUrl: string): Promise<string> {
    configureFal();
    return runTrellis2(imageUrl);
}

const ALLOWED_SOURCE_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/**
 * Uploads raw image bytes to Fal storage, then runs Trellis 2.
 * Returns a temporary Fal CDN URL for the GLB (not persisted in our bucket).
 */
export async function generateGlbUrlFromImageBuffer(
    imageBuffer: Buffer,
    mimeType: string
): Promise<string> {
    const normalized = mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
    if (!ALLOWED_SOURCE_MIME.has(normalized)) {
        throw new Error("Unsupported image type; use JPEG, PNG, WebP, or GIF");
    }
    configureFal();
    const blob = new Blob([new Uint8Array(imageBuffer)], { type: normalized });
    const hostedImageUrl = await fal.storage.upload(blob);
    return runTrellis2(hostedImageUrl);
}
