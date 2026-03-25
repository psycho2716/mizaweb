"use server";

import { redirect } from "next/navigation";

import type { ApiResult } from "@/types";
import type { LoginFormData, RegisterFormData } from "@/types";
import { loginSchema, registerSchema } from "@/types/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function login(values: LoginFormData): Promise<ApiResult<null>> {
  const parsed = loginSchema.safeParse(values);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { success: false, error: error.message };

  // Middleware will handle role-based routing from this landing page.
  redirect("/dashboard");
}

export async function register(values: RegisterFormData): Promise<ApiResult<null>> {
  const parsed = registerSchema.safeParse(values);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: {
        role: parsed.data.role,
        fullName: parsed.data.fullName,
      },
    },
  });

  if (error) return { success: false, error: error.message };

  redirect("/auth/success");
}

export async function logout(): Promise<ApiResult<null>> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signOut();

  if (error) return { success: false, error: error.message };

  redirect("/auth/login");
}

export async function forgotPassword(email: string): Promise<ApiResult<null>> {
  const normalized = email.trim();
  const parsed = loginSchema.pick({ email: true }).safeParse({ email: normalized, password: "xxxxxxxx" });
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(normalized);

  if (error) return { success: false, error: error.message };

  redirect("/auth/success");
}

