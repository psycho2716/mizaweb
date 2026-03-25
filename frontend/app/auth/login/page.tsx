"use client";

import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import type { LoginFormData } from "@/types";
import { loginSchema } from "@/types/validation";
import { login } from "@/app/auth/actions";

export default function LoginPage() {
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register: registerField,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-6">
      <div className="w-full max-w-md bg-white rounded-xl border border-zinc-200 p-6">
        <h1 className="text-2xl font-semibold">Login</h1>
        <p className="text-zinc-600 mt-1">Sign in to continue.</p>

        {serverError && (
          <div className="mt-4 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {serverError}
          </div>
        )}

        <form
          className="mt-6 flex flex-col gap-4"
          onSubmit={handleSubmit(async (values) => {
            setServerError(null);
            const result = await login(values);
            if (!result.success) setServerError(result.error);
          })}
        >
          <div className="flex flex-col gap-1">
            <label className="text-sm text-zinc-700" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              className="h-10 rounded-md border border-zinc-300 px-3"
              {...registerField("email")}
            />
            {errors.email?.message && <p className="text-sm text-red-600">{errors.email.message}</p>}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm text-zinc-700" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              className="h-10 rounded-md border border-zinc-300 px-3"
              {...registerField("password")}
            />
            {errors.password?.message && <p className="text-sm text-red-600">{errors.password.message}</p>}
          </div>

          <button
            type="submit"
            className="h-10 rounded-md bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-60"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Signing in..." : "Sign in"}
          </button>

          <div className="text-sm text-zinc-600 flex items-center justify-between">
            <Link className="underline hover:text-zinc-900" href="/auth/forgot-password">
              Forgot password?
            </Link>
            <Link className="underline hover:text-zinc-900" href="/auth/register">
              Create account
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

