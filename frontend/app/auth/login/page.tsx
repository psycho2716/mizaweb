"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isCallbackAllowedForRole, parseSafeCallbackUrl } from "@/lib/auth/callback-url";
import { loginWithEmailPassword } from "@/lib/api/endpoints";
import { loginSchema } from "@/types";

type LoginFormValues = z.infer<typeof loginSchema>;

function defaultPathAfterLogin(role: string): string {
    if (role === "admin") {
        return "/admin/verifications";
    }
    if (role === "seller") {
        return "/seller/listings";
    }
    return "/products";
}

function LoginPageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [showPassword, setShowPassword] = useState(false);
    const {
        register,
        handleSubmit,
        formState: { isSubmitting, errors }
    } = useForm<LoginFormValues>({
        resolver: zodResolver(loginSchema),
        defaultValues: {
            email: "",
            password: ""
        }
    });

    const rawCallback =
        parseSafeCallbackUrl(searchParams.get("callbackUrl")) ??
        parseSafeCallbackUrl(searchParams.get("next"));
    const registerHref =
        rawCallback != null
            ? `/auth/register?callbackUrl=${encodeURIComponent(rawCallback)}`
            : "/auth/register";

    async function handleLogin(values: LoginFormValues) {
        try {
            const result = await loginWithEmailPassword(values.email, values.password);
            localStorage.setItem("miza_token", result.token);
            localStorage.setItem("miza_user", JSON.stringify(result.user));
            await fetch("/api/auth/session", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token: result.token, role: result.user.role })
            });
            window.dispatchEvent(new Event("miza-auth-change"));

            const userRole = result.user.role;
            const pending =
                parseSafeCallbackUrl(searchParams.get("callbackUrl")) ??
                parseSafeCallbackUrl(searchParams.get("next"));
            const dest =
                pending && isCallbackAllowedForRole(pending, userRole)
                    ? pending
                    : defaultPathAfterLogin(userRole);

            router.push(dest);
            toast.success("Login successful");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Login failed");
        }
    }

    return (
        <main className="relative min-h-screen bg-[#070b11]">
            <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_54%_18%,rgba(34,199,243,0.08),transparent_36%),linear-gradient(90deg,rgba(7,11,17,0)_44%,rgba(7,11,17,0.34)_52%,rgba(7,11,17,0)_60%)]" />
            <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_18%_20%,rgba(34,199,243,0.14),transparent_34%),linear-gradient(140deg,#0a0f16_0%,#0a0d13_48%,#07090f_100%)]" />
            <div className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(120deg,rgba(6,10,16,0.2)_10%,rgba(5,8,13,0.58)_55%,rgba(4,6,11,0.84)_100%)]" />

            <div className="relative z-10 mx-auto grid min-h-screen w-full max-w-7xl md:grid-cols-2">
                <section className="relative hidden min-h-screen overflow-hidden md:block">
                    <div className="relative flex h-full flex-col justify-between p-10">
                        <div className="space-y-6">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--accent)">
                                Buyer & seller access
                            </p>
                            <h1 className="max-w-sm text-6xl font-semibold tracking-tight text-foreground">
                                Mizaweb
                            </h1>
                            <p className="max-w-md text-base leading-7 text-(--muted)">
                                Access your marketplace workspace, track orders, and manage your
                                sourcing operations.
                            </p>
                            <div className="space-y-3 pt-4 text-sm uppercase tracking-[0.17em] text-(--foreground)/80">
                                <p className="flex items-center gap-3">
                                    <span className="h-px w-8 bg-(--accent)" />
                                    Verified supply network
                                </p>
                                <p className="pl-11">Procurement intelligence</p>
                            </div>
                        </div>
                        <div className="max-w-xs border border-(--border) bg-[#0f141d] px-5 py-4">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-(--muted)">
                                Active catalog
                            </p>
                            <p className="mt-2 text-xl font-medium text-foreground">
                                Premium Stone Collection
                            </p>
                        </div>
                    </div>
                </section>

                <section className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-6 md:px-8 lg:px-10">
                    <div className="relative w-full max-w-[680px] rounded-sm border border-(--border) bg-[#0c1119]/95 p-7 md:p-10">
                        <p className="text-xs uppercase tracking-[0.16em] text-(--muted)">
                            Welcome back
                        </p>
                        <h2 className="mt-3 text-4xl font-semibold tracking-tight text-foreground">
                            Sign in
                        </h2>
                        <p className="mt-2 text-sm text-(--muted)">
                            Enter your account credentials to continue.
                        </p>

                        <form className="mt-8 space-y-5" onSubmit={handleSubmit(handleLogin)}>
                            <div className="space-y-2">
                                <Label
                                    htmlFor="email"
                                    className="text-xs uppercase tracking-[0.14em] text-(--muted)"
                                >
                                    Identification / email
                                </Label>
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="name@company.com"
                                    className="h-11 border-x-0 border-t-0 border-b-(--border) rounded-none bg-transparent px-2 text-base text-foreground placeholder:text-(--muted) focus-visible:ring-0"
                                    {...register("email")}
                                />
                                {errors.email ? (
                                    <p className="text-sm text-red-400">{errors.email.message}</p>
                                ) : null}
                            </div>

                            <div className="space-y-2">
                                <Label
                                    htmlFor="password"
                                    className="text-xs uppercase tracking-[0.14em] text-(--muted)"
                                >
                                    Secure key / password
                                </Label>
                                <div className="relative">
                                    <Input
                                        id="password"
                                        type={showPassword ? "text" : "password"}
                                        placeholder="Enter password"
                                        className="h-11 border-x-0 border-t-0 border-b-(--border) rounded-none bg-transparent px-2 pr-10 text-base text-foreground placeholder:text-(--muted) focus-visible:ring-0"
                                        {...register("password")}
                                    />
                                    <button
                                        type="button"
                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-(--muted) hover:text-foreground"
                                        onClick={() => setShowPassword((prev) => !prev)}
                                        aria-label={
                                            showPassword ? "Hide password" : "Show password"
                                        }
                                    >
                                        {showPassword ? (
                                            <EyeOff className="h-4 w-4" aria-hidden />
                                        ) : (
                                            <Eye className="h-4 w-4" aria-hidden />
                                        )}
                                    </button>
                                </div>
                                {errors.password ? (
                                    <p className="text-sm text-red-400">
                                        {errors.password.message}
                                    </p>
                                ) : null}
                            </div>

                            <Button
                                type="submit"
                                disabled={isSubmitting}
                                className="mt-2 h-12 w-full rounded-sm bg-(--accent) text-sm font-semibold uppercase tracking-[0.16em] text-[#031018] hover:brightness-110"
                            >
                                {isSubmitting ? "Authenticating..." : "Authenticate"}
                            </Button>

                            <div className="flex items-center justify-between pt-1 text-xs uppercase tracking-[0.12em]">
                                <span className="text-(--muted)">Need access?</span>
                                <Link href={registerHref} className="font-semibold text-(--accent)">
                                    Create account
                                </Link>
                            </div>
                        </form>
                    </div>
                </section>
            </div>
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_84%_16%,rgba(34,199,243,0.09),transparent_36%)]" />
        </main>
    );
}

export default function LoginPage() {
    return (
        <Suspense
            fallback={
                <main className="flex min-h-screen items-center justify-center bg-[#070b11] text-sm text-(--muted)">
                    Loading…
                </main>
            }
        >
            <LoginPageContent />
        </Suspense>
    );
}
