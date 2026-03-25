"use client";

import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { forgotPassword } from "@/app/auth/actions";

import type { ForgotPasswordFormData } from "@/types";
import { forgotPasswordSchema } from "@/types/validation";

export default function ForgotPasswordPage() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-6">
      <div className="w-full max-w-md bg-white rounded-xl border border-zinc-200 p-6">
        <h1 className="text-2xl font-semibold">Reset password</h1>
        <p className="text-zinc-600 mt-1">We’ll email you a reset link.</p>

        {serverError && (
          <div className="mt-4 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {serverError}
          </div>
        )}

        {sent ? (
          <div className="mt-6 text-sm text-zinc-700">
            If an account exists for this email, a password reset link has been sent.
          </div>
        ) : (
          <form
            className="mt-6 flex flex-col gap-4"
            onSubmit={handleSubmit(async (values) => {
              setServerError(null);
              const result = await forgotPassword(values.email);
              if (!result.success) {
                setServerError(result.error);
                return;
              }
              setSent(true);
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
                {...register("email")}
              />
              {errors.email?.message && <p className="text-sm text-red-600">{errors.email.message}</p>}
            </div>

            <button
              type="submit"
              className="h-10 rounded-md bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-60"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Sending..." : "Send reset link"}
            </button>

            <div className="text-sm text-zinc-600 flex items-center justify-between">
              <Link className="underline hover:text-zinc-900" href="/auth/login">
                Back to login
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

