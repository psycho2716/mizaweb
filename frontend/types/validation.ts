import { z } from "zod";

import type { ForgotPasswordFormData, LoginFormData, RegisterFormData } from "./auth";

export const loginSchema = z.object({
  email: z.string().min(1, { message: "Email is required" }).email({ message: "Invalid email address" }),
  password: z.string().min(8, { message: "Password must be at least 8 characters" }),
}) satisfies z.ZodType<LoginFormData>;

export const registerSchema = z.object({
  fullName: z.string().min(1, { message: "Full name is required" }).max(100, { message: "Name is too long" }),
  email: z.string().min(1, { message: "Email is required" }).email({ message: "Invalid email address" }),
  password: z
    .string()
    .min(8, { message: "Password must be at least 8 characters" }),
  role: z.enum(["seller", "customer"]),
}) satisfies z.ZodType<RegisterFormData>;

export const forgotPasswordSchema = z.object({
  email: z.string().min(1, { message: "Email is required" }).email({ message: "Invalid email address" }),
}) satisfies z.ZodType<ForgotPasswordFormData>;

