import { config } from "dotenv";
import { z } from "zod";

config();

const envSchema = z.object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    FRONTEND_URL: z.string().min(1).default("http://localhost:3000"),
    SUPABASE_URL: z.string().min(1).optional(),
    SUPABASE_ANON_KEY: z.string().min(1).optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
    SUPABASE_VERIFICATION_BUCKET: z.string().min(1).default("verification-docs"),
    /** Product listing images, video, GLB (must allow video + model MIME types; not verification-docs). */
    SUPABASE_PRODUCT_MEDIA_BUCKET: z.string().min(1).default("product-media"),
    JWT_SECRET: z.string().min(16).default("replace-with-a-secure-secret"),
    GOOGLE_MAPS_API_KEY: z.string().optional(),
    GOOGLE_DIRECTIONS_API_KEY: z.string().optional(),
    FAL_API_KEY: z.string().optional(),
    /** Reject 3D generation when fal-ai/imageutils/nsfw reports probability >= this (0–1). Higher = stricter. */
    FAL_NSFW_THRESHOLD: z.coerce.number().min(0).max(1).default(0.72),
    /** Set to "1" to skip the NSFW gate (dev only; Trellis may still fail or charge). */
    FAL_SKIP_NSFW_GATE: z.string().optional()
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
    throw new Error(`Invalid environment variables: ${parsed.error.message}`);
}

export const env = parsed.data;
