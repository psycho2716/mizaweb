"use client";

import { Store } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { Suspense, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    createVerificationUploadUrl,
    registerAccount,
    submitSellerVerification
} from "@/lib/api/endpoints";
import { isCallbackAllowedForRole, parseSafeCallbackUrl } from "@/lib/auth/callback-url";
import { persistClientAuthSession } from "@/lib/auth/persist-client-session";
import { putToSignedUploadUrl } from "@/lib/storage/put-signed-upload";
import { buyerRegisterSchema, sellerRegisterSchema } from "@/types";

const SellerShopMapPicker = dynamic(() => import("@/components/auth/seller-shop-map-picker"), {
    ssr: false,
    loading: () => (
        <div className="flex h-64 items-center justify-center rounded-md border border-(--border) text-xs text-(--muted) md:col-span-2">
            Loading map…
        </div>
    )
});

type BuyerRegisterFormValues = z.infer<typeof buyerRegisterSchema>;
type SellerRegisterFormValues = z.infer<typeof sellerRegisterSchema>;

function RegisterPageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [permitFile, setPermitFile] = useState<File | null>(null);
    const loginHref = (() => {
        const raw = parseSafeCallbackUrl(searchParams.get("callbackUrl"));
        return raw != null
            ? `/auth/login?callbackUrl=${encodeURIComponent(raw)}`
            : "/auth/login";
    })();

    const {
        register: registerBuyer,
        handleSubmit: handleBuyerSubmit,
        formState: { isSubmitting: isBuyerSubmitting, errors: buyerErrors }
    } = useForm<BuyerRegisterFormValues>({
        resolver: zodResolver(buyerRegisterSchema),
        defaultValues: {
            email: "",
            password: "",
            role: "buyer"
        }
    });

    const {
        register: registerSeller,
        handleSubmit: handleSellerSubmit,
        control: sellerControl,
        setValue,
        formState: { isSubmitting: isSellerSubmitting, errors: sellerErrors }
    } = useForm<SellerRegisterFormValues>({
        resolver: zodResolver(sellerRegisterSchema),
        defaultValues: {
            email: "",
            password: "",
            role: "seller",
            fullName: "",
            businessName: "",
            contactNumber: "",
            address: "",
            shopLatitude: undefined as unknown as number,
            shopLongitude: undefined as unknown as number
        }
    });

    const shopLat = useWatch({ control: sellerControl, name: "shopLatitude" });
    const shopLng = useWatch({ control: sellerControl, name: "shopLongitude" });

    async function completeRegistration(values: BuyerRegisterFormValues) {
        try {
            const result = await registerAccount(values.email, values.password, values.role, {});
            await persistClientAuthSession({
                token: result.token,
                user: result.user,
                refreshToken: result.refreshToken
            });

            const pending = parseSafeCallbackUrl(searchParams.get("callbackUrl"));
            const dest =
                pending && isCallbackAllowedForRole(pending, "buyer")
                    ? pending
                    : "/products";
            router.push(dest);
            toast.success("Account created successfully");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Registration failed");
        }
    }

    async function handleBuyerRegister(values: BuyerRegisterFormValues) {
        await completeRegistration(values);
    }

    async function handleSellerRegister(values: SellerRegisterFormValues) {
        if (!permitFile) {
            toast.error("Business permit file is required.");
            return;
        }

        const isAllowedType =
            permitFile.type === "application/pdf" || permitFile.type.startsWith("image/");
        if (!isAllowedType) {
            toast.error("Business permit must be a PDF or image file.");
            return;
        }

        try {
            const result = await registerAccount(values.email, values.password, values.role, {
                businessName: values.businessName,
                contactNumber: values.contactNumber,
                address: values.address,
                fullName: values.fullName,
                shopLatitude: values.shopLatitude,
                shopLongitude: values.shopLongitude
            });

            await persistClientAuthSession({
                token: result.token,
                user: result.user,
                refreshToken: result.refreshToken
            });

            const target = await createVerificationUploadUrl(permitFile.name);
            const putRes = await putToSignedUploadUrl(target.uploadUrl, permitFile);
            if (!putRes.ok) {
                console.warn(
                    "Permit upload PUT returned non-OK; continuing with signed URL for submit."
                );
            }
            await submitSellerVerification(target.uploadUrl, undefined, target.path);
            toast.success("Seller account created and verification submitted.");
            router.push("/seller/dashboard");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Seller registration failed");
        }
    }

    return (
        <main className="relative min-h-screen flex justify-center items-center bg-[#070b11]">
            <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_54%_18%,rgba(34,199,243,0.08),transparent_36%),linear-gradient(90deg,rgba(7,11,17,0)_44%,rgba(7,11,17,0.34)_52%,rgba(7,11,17,0)_60%)]" />
            <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_18%_20%,rgba(34,199,243,0.14),transparent_34%),linear-gradient(140deg,#0a0f16_0%,#0a0d13_48%,#07090f_100%)]" />
            <div className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(120deg,rgba(6,10,16,0.2)_10%,rgba(5,8,13,0.58)_55%,rgba(4,6,11,0.84)_100%)]" />

            <div className="relative z-10 grid min-h-screen w-full md:grid-cols-2 lg:max-w-[75%] mx-auto">
                <section className="relative hidden min-h-screen overflow-hidden md:block">
                    <div className="relative flex justify-between h-full flex-col gap-42 p-10">
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-(--accent)">
                                Access the marketplace
                            </p>
                            <h1 className="mt-5 max-w-sm text-6xl leading-[0.94] font-semibold text-foreground">
                                Build The Future In Stone.
                            </h1>
                            <p className="mt-6 max-w-sm text-base leading-7 text-(--muted)">
                                Join buyers and verified sellers in one sourcing ecosystem built for
                                quality materials and reliable delivery.
                            </p>
                        </div>
                        <p className="text-xs uppercase tracking-[0.14em] text-(--muted)">
                            Mizaweb marketplace
                        </p>
                    </div>
                </section>

                <section className="relative flex min-h-screen items-center justify-center px-5 py-6 md:px-8 lg:px-10">
                    <div className="relative flex w-full max-w-[480px] h-full flex-col border border-(--border) bg-[#0c1119]/95 p-7 md:p-10">
                        <p className="text-xs uppercase tracking-[0.16em] text-(--muted)">
                            Create account
                        </p>
                        <h2 className="mt-3 text-4xl font-semibold tracking-tight text-foreground">
                            Join Mizaweb
                        </h2>
                        <p className="mt-2 text-sm text-(--muted)">
                            Select your account type and complete your registration details.
                        </p>

                        <Tabs defaultValue="buyer" className="mt-8 flex w-full flex-1 flex-col">
                            <TabsList className="grid w-full grid-cols-2 rounded-none border border-(--border) bg-transparent p-1">
                                <TabsTrigger
                                    value="buyer"
                                    className="rounded-none text-xs font-semibold uppercase tracking-[0.12em] data-[state=active]:bg-(--accent) data-[state=active]:text-[#031018]"
                                >
                                    Buyer
                                </TabsTrigger>
                                <TabsTrigger
                                    value="seller"
                                    className="rounded-none text-xs font-semibold uppercase tracking-[0.12em] data-[state=active]:bg-(--accent) data-[state=active]:text-[#031018]"
                                >
                                    Seller
                                </TabsTrigger>
                            </TabsList>

                            <TabsContent value="buyer" className="min-h-0 overflow-y-auto pt-5">
                                <form
                                    className="space-y-4"
                                    onSubmit={handleBuyerSubmit(handleBuyerRegister)}
                                >
                                    <div className="space-y-2 col-span-2 lg:col-span-1">
                                        <Label
                                            htmlFor="buyer-email"
                                            className="text-xs uppercase tracking-[0.14em] text-(--muted)"
                                        >
                                            Email address
                                        </Label>
                                        <Input
                                            id="buyer-email"
                                            type="email"
                                            placeholder="name@company.com"
                                            className="h-11 rounded-none border-x-0 border-t-0 border-b-(--border) bg-transparent px-0 text-foreground focus-visible:ring-0"
                                            {...registerBuyer("email")}
                                        />
                                        {buyerErrors.email ? (
                                            <p className="text-sm text-red-400">
                                                {buyerErrors.email.message}
                                            </p>
                                        ) : null}
                                    </div>
                                    <div className="space-y-2 col-span-2 lg:col-span-1">
                                        <Label
                                            htmlFor="buyer-password"
                                            className="text-xs uppercase tracking-[0.14em] text-(--muted)"
                                        >
                                            Password
                                        </Label>
                                        <Input
                                            id="buyer-password"
                                            type="password"
                                            placeholder="At least 8 characters"
                                            className="h-11 rounded-none border-x-0 border-t-0 border-b-(--border) bg-transparent px-0 text-foreground focus-visible:ring-0"
                                            {...registerBuyer("password")}
                                        />
                                        {buyerErrors.password ? (
                                            <p className="text-sm text-red-400">
                                                {buyerErrors.password.message}
                                            </p>
                                        ) : null}
                                    </div>
                                    <div className="col-span-2 flex items-center justify-center pt-2">
                                        <Button
                                            type="submit"
                                            disabled={isBuyerSubmitting}
                                            className="mt-2 h-12 rounded-sm bg-(--accent) px-8 text-sm font-semibold uppercase tracking-[0.14em] text-[#031018] hover:brightness-110"
                                        >
                                            {isBuyerSubmitting
                                                ? "Creating account..."
                                                : "Register buyer"}
                                        </Button>
                                    </div>
                                </form>
                            </TabsContent>

                            <TabsContent
                                value="seller"
                                className="min-h-0 overflow-y-auto pt-5 pr-1"
                            >
                                <form
                                    className="grid gap-4 md:grid-cols-2"
                                    onSubmit={handleSellerSubmit(handleSellerRegister)}
                                >
                                    <div className="space-y-2 col-span-2 lg:col-span-1">
                                        <Label
                                            htmlFor="seller-email"
                                            className="text-xs uppercase tracking-[0.14em] text-(--muted)"
                                        >
                                            Email address
                                        </Label>
                                        <Input
                                            id="seller-email"
                                            type="email"
                                            placeholder="store@company.com"
                                            className="h-11 rounded-none border-x-0 border-t-0 border-b-(--border) bg-transparent px-2 text-foreground focus-visible:ring-0"
                                            {...registerSeller("email")}
                                        />
                                        {sellerErrors.email ? (
                                            <p className="text-sm text-red-400">
                                                {sellerErrors.email.message}
                                            </p>
                                        ) : null}
                                    </div>
                                    <div className="space-y-2 col-span-2 lg:col-span-1">
                                        <Label
                                            htmlFor="seller-password"
                                            className="text-xs uppercase tracking-[0.14em] text-(--muted)"
                                        >
                                            Password
                                        </Label>
                                        <Input
                                            id="seller-password"
                                            type="password"
                                            placeholder="At least 8 characters"
                                            className="h-11 rounded-none border-x-0 border-t-0 border-b-(--border) bg-transparent px-2 text-foreground focus-visible:ring-0"
                                            {...registerSeller("password")}
                                        />
                                        {sellerErrors.password ? (
                                            <p className="text-sm text-red-400">
                                                {sellerErrors.password.message}
                                            </p>
                                        ) : null}
                                    </div>
                                    <div className="space-y-2 col-span-2 lg:col-span-1">
                                        <Label
                                            htmlFor="seller-full-name"
                                            className="text-xs uppercase tracking-[0.14em] text-(--muted)"
                                        >
                                            Full name
                                        </Label>
                                        <Input
                                            id="seller-full-name"
                                            placeholder="Juan Dela Cruz"
                                            className="h-11 rounded-none border-x-0 border-t-0 border-b-(--border) bg-transparent px-2 text-foreground focus-visible:ring-0"
                                            {...registerSeller("fullName")}
                                        />
                                        {sellerErrors.fullName ? (
                                            <p className="text-sm text-red-400">
                                                {sellerErrors.fullName.message}
                                            </p>
                                        ) : null}
                                    </div>
                                    <div className="space-y-2 col-span-2 lg:col-span-1">
                                        <Label
                                            htmlFor="seller-business-name"
                                            className="text-xs uppercase tracking-[0.14em] text-(--muted)"
                                        >
                                            Business name
                                        </Label>
                                        <Input
                                            id="seller-business-name"
                                            placeholder="Miza Stone Studio"
                                            className="h-11 rounded-none border-x-0 border-t-0 border-b-(--border) bg-transparent px-2 text-foreground focus-visible:ring-0"
                                            {...registerSeller("businessName")}
                                        />
                                        {sellerErrors.businessName ? (
                                            <p className="text-sm text-red-400">
                                                {sellerErrors.businessName.message}
                                            </p>
                                        ) : null}
                                    </div>
                                    <div className="space-y-2 col-span-2 lg:col-span-1">
                                        <Label
                                            htmlFor="seller-contact-number"
                                            className="text-xs uppercase tracking-[0.14em] text-(--muted)"
                                        >
                                            Contact number
                                        </Label>
                                        <Input
                                            id="seller-contact-number"
                                            placeholder="+639000000001"
                                            className="h-11 rounded-none border-x-0 border-t-0 border-b-(--border) bg-transparent px-2 text-foreground focus-visible:ring-0"
                                            {...registerSeller("contactNumber")}
                                        />
                                        {sellerErrors.contactNumber ? (
                                            <p className="text-sm text-red-400">
                                                {sellerErrors.contactNumber.message}
                                            </p>
                                        ) : null}
                                    </div>
                                    <div className="space-y-2 col-span-2 lg:col-span-1">
                                        <Label
                                            htmlFor="seller-address"
                                            className="text-xs uppercase tracking-[0.14em] text-(--muted)"
                                        >
                                            Business address
                                        </Label>
                                        <Input
                                            id="seller-address"
                                            placeholder="Romblon, Philippines"
                                            className="h-11 rounded-none border-x-0 border-t-0 border-b-(--border) bg-transparent px-2 text-foreground focus-visible:ring-0"
                                            {...registerSeller("address")}
                                        />
                                        {sellerErrors.address ? (
                                            <p className="text-sm text-red-400">
                                                {sellerErrors.address.message}
                                            </p>
                                        ) : null}
                                    </div>
                                    <div className="col-span-2">
                                        <SellerShopMapPicker
                                            latitude={
                                                Number.isFinite(shopLat) ? shopLat : undefined
                                            }
                                            longitude={
                                                Number.isFinite(shopLng) ? shopLng : undefined
                                            }
                                            onPositionChange={(lat, lng) => {
                                                setValue("shopLatitude", lat, {
                                                    shouldValidate: true,
                                                    shouldDirty: true
                                                });
                                                setValue("shopLongitude", lng, {
                                                    shouldValidate: true,
                                                    shouldDirty: true
                                                });
                                            }}
                                            error={
                                                sellerErrors.shopLatitude?.message ??
                                                sellerErrors.shopLongitude?.message
                                            }
                                        />
                                    </div>
                                    <div className="space-y-2 col-span-2">
                                        <Label
                                            htmlFor="seller-permit-file"
                                            className="text-xs uppercase tracking-[0.14em] text-(--muted)"
                                        >
                                            Business permit (PDF or image)
                                        </Label>
                                        <Input
                                            id="seller-permit-file"
                                            type="file"
                                            accept=".pdf,image/*"
                                            className="h-11 rounded-none border-x-0 border-t-0 border-b-(--border) bg-transparent px-0 text-foreground file:mr-3 file:border-0 file:bg-(--surface-elevated) file:px-3 file:py-1 file:text-xs file:uppercase file:tracking-[0.12em] file:text-(--muted) focus-visible:ring-0"
                                            onChange={(event) => {
                                                const nextFile = event.target.files?.[0] ?? null;
                                                setPermitFile(nextFile);
                                            }}
                                        />
                                        <p className="text-xs text-(--muted) flex items-center gap-2">
                                            <Store className="h-3.5 w-3.5" aria-hidden />
                                            Required for seller verification during registration.
                                        </p>
                                    </div>
                                    <div className="col-span-2 flex items-center justify-center pt-2">
                                        <Button
                                            type="submit"
                                            disabled={isSellerSubmitting}
                                            className="h-12 w-full rounded-sm bg-(--accent) px-8 text-sm font-semibold uppercase tracking-[0.14em] text-[#031018] hover:brightness-110"
                                        >
                                            {isSellerSubmitting
                                                ? "Creating seller account..."
                                                : "Register seller"}
                                        </Button>
                                    </div>
                                </form>
                            </TabsContent>
                        </Tabs>

                        <p className="mt-7 mx-auto text-xs uppercase tracking-[0.12em] text-(--muted)">
                            Already have an account?{" "}
                            <Link href={loginHref} className="font-semibold text-(--accent)">
                                Login
                            </Link>
                        </p>
                    </div>
                </section>
            </div>
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_84%_16%,rgba(34,199,243,0.09),transparent_36%)]" />
        </main>
    );
}

export default function RegisterPage() {
    return (
        <Suspense
            fallback={
                <main className="flex min-h-screen items-center justify-center bg-[#070b11] text-sm text-(--muted)">
                    Loading…
                </main>
            }
        >
            <RegisterPageContent />
        </Suspense>
    );
}
