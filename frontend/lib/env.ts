import { z } from "zod";

export const env = z
  .object({
    NEXT_PUBLIC_APP_NAME: z.string().min(1),
    NEXT_PUBLIC_BACKEND_URL: z.string().min(1),
    NEXT_PUBLIC_SUPABASE_URL: z.string().min(1),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  })
  .parse(process.env);

