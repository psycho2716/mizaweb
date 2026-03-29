import { fal } from "@fal-ai/client";
import { env } from "../config/env";

/** Thrown before Trellis runs so 3D generation is not billed when content is flagged. */
export class NsfwContentRejectedError extends Error {
    readonly code = "NSFW_REJECTED" as const;
    constructor(
        readonly nsfwProbability: number,
        message?: string
    ) {
        super(
            message ??
                "This image was flagged by an automated safety check (e.g. adult or sensitive content). Use a clear photo of a product or object instead. 3D generation was not started."
        );
        this.name = "NsfwContentRejectedError";
    }
}

export function isNsfwContentRejectedError(e: unknown): e is NsfwContentRejectedError {
    return e instanceof NsfwContentRejectedError;
}

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

type NsfwFilterOutput = {
    nsfw_probability?: number;
};

/**
 * Cheap fal-ai/imageutils/nsfw pass; must run before Trellis to avoid 3D API cost on blocked images.
 */
async function assertImagePassesNsfwGate(imageUrl: string): Promise<void> {
    if (env.FAL_SKIP_NSFW_GATE === "1") {
        return;
    }
    const result = await fal.subscribe("fal-ai/imageutils/nsfw", {
        input: { image_url: imageUrl }
    });
    const data = result.data as NsfwFilterOutput | undefined;
    const p = data?.nsfw_probability;
    if (typeof p !== "number" || Number.isNaN(p)) {
        throw new Error("Content safety check did not return a score; try again or use another image.");
    }
    if (p >= env.FAL_NSFW_THRESHOLD) {
        throw new NsfwContentRejectedError(p);
    }
}

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
    await assertImagePassesNsfwGate(imageUrl);
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
    await assertImagePassesNsfwGate(hostedImageUrl);
    return runTrellis2(hostedImageUrl);
}
