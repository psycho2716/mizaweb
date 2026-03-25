import { z } from "zod";

const envSchema = z.object({
    PORT: z.coerce.number().int().positive().default(3000),
    CORS_ORIGIN: z.string().min(1, "CORS_ORIGIN is required"),

    SUPABASE_URL: z.string().min(1, "SUPABASE_URL is required"),
    SUPABASE_ANON_KEY: z.string().min(1, "SUPABASE_ANON_KEY is required"),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),

    FAL_API_KEY: z.string().optional(),
    FAL_2D_TO_3D_URL: z.string().optional(),
    GOOGLE_MAPS_API_KEY: z.string().optional()
});

export const env = envSchema.parse(process.env);
