"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    createVerificationUploadUrl,
    registerAccount,
    submitSellerVerification
} from "@/lib/api/endpoints";
import { buyerRegisterSchema, sellerRegisterSchema } from "@/types";

type BuyerRegisterFormValues = z.infer<typeof buyerRegisterSchema>;
type SellerRegisterFormValues = z.infer<typeof sellerRegisterSchema>;

export default function RegisterPage() {
    const router = useRouter();
    const [permitFile, setPermitFile] = useState<File | null>(null);

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
            address: ""
        }
    });

    async function completeRegistration(
        values: BuyerRegisterFormValues | SellerRegisterFormValues
    ) {
        try {
            const result = await registerAccount(values.email, values.password, values.role, {
                ...(values.role === "seller"
                    ? {
                          fullName: values.fullName,
                          businessName: values.businessName,
                          contactNumber: values.contactNumber,
                          address: values.address
                      }
                    : {})
            });
            localStorage.setItem("miza_token", result.token);
            localStorage.setItem("miza_user", JSON.stringify(result.user));
            await fetch("/api/auth/session", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token: result.token, role: result.user.role })
            });

            if (values.role === "seller") {
                router.push("/seller/verification");
            } else {
                router.push("/products");
            }
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
                fullName: values.fullName
            });

            localStorage.setItem("miza_token", result.token);
            localStorage.setItem("miza_user", JSON.stringify(result.user));
            await fetch("/api/auth/session", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token: result.token, role: result.user.role })
            });

            const target = await createVerificationUploadUrl(permitFile.name);
            await submitSellerVerification(target.uploadUrl);
            toast.success("Seller account created and verification submitted.");
            router.push("/seller/verification");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Seller registration failed");
        }
    }

    return (
        <main className="mx-auto max-w-lg p-6">
            <Card>
                <CardHeader>
                    <CardTitle>Create account</CardTitle>
                    <CardDescription>
                        Choose your account type. Admin accounts are managed by the platform.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Tabs defaultValue="buyer" className="w-full">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="buyer">Buyer Account</TabsTrigger>
                            <TabsTrigger value="seller">Seller Account</TabsTrigger>
                        </TabsList>

                        <TabsContent value="buyer">
                            <form
                                className="space-y-4"
                                onSubmit={handleBuyerSubmit(handleBuyerRegister)}
                            >
                                <div className="space-y-1.5">
                                    <Label htmlFor="buyer-email">Email</Label>
                                    <Input
                                        id="buyer-email"
                                        type="email"
                                        placeholder="name@example.com"
                                        {...registerBuyer("email")}
                                    />
                                    {buyerErrors.email ? (
                                        <p className="text-sm text-red-600">
                                            {buyerErrors.email.message}
                                        </p>
                                    ) : null}
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="buyer-password">Password</Label>
                                    <Input
                                        id="buyer-password"
                                        type="password"
                                        placeholder="At least 8 characters"
                                        {...registerBuyer("password")}
                                    />
                                    {buyerErrors.password ? (
                                        <p className="text-sm text-red-600">
                                            {buyerErrors.password.message}
                                        </p>
                                    ) : null}
                                </div>
                                <Button type="submit" disabled={isBuyerSubmitting}>
                                    {isBuyerSubmitting
                                        ? "Creating buyer account..."
                                        : "Register as Buyer"}
                                </Button>
                            </form>
                        </TabsContent>

                        <TabsContent value="seller">
                            <form
                                className="space-y-4"
                                onSubmit={handleSellerSubmit(handleSellerRegister)}
                            >
                                <div className="space-y-1.5">
                                    <Label htmlFor="seller-email">Email</Label>
                                    <Input
                                        id="seller-email"
                                        type="email"
                                        placeholder="store@example.com"
                                        {...registerSeller("email")}
                                    />
                                    {sellerErrors.email ? (
                                        <p className="text-sm text-red-600">
                                            {sellerErrors.email.message}
                                        </p>
                                    ) : null}
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="seller-password">Password</Label>
                                    <Input
                                        id="seller-password"
                                        type="password"
                                        placeholder="At least 8 characters"
                                        {...registerSeller("password")}
                                    />
                                    {sellerErrors.password ? (
                                        <p className="text-sm text-red-600">
                                            {sellerErrors.password.message}
                                        </p>
                                    ) : null}
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="seller-full-name">Full name</Label>
                                    <Input
                                        id="seller-full-name"
                                        placeholder="Juan Dela Cruz"
                                        {...registerSeller("fullName")}
                                    />
                                    {sellerErrors.fullName ? (
                                        <p className="text-sm text-red-600">
                                            {sellerErrors.fullName.message}
                                        </p>
                                    ) : null}
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="seller-business-name">Business name</Label>
                                    <Input
                                        id="seller-business-name"
                                        placeholder="Romblon Stone Craft"
                                        {...registerSeller("businessName")}
                                    />
                                    {sellerErrors.businessName ? (
                                        <p className="text-sm text-red-600">
                                            {sellerErrors.businessName.message}
                                        </p>
                                    ) : null}
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="seller-contact-number">Contact number</Label>
                                    <Input
                                        id="seller-contact-number"
                                        placeholder="+639000000001"
                                        {...registerSeller("contactNumber")}
                                    />
                                    {sellerErrors.contactNumber ? (
                                        <p className="text-sm text-red-600">
                                            {sellerErrors.contactNumber.message}
                                        </p>
                                    ) : null}
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="seller-address">Business address</Label>
                                    <Input
                                        id="seller-address"
                                        placeholder="Romblon, Philippines"
                                        {...registerSeller("address")}
                                    />
                                    {sellerErrors.address ? (
                                        <p className="text-sm text-red-600">
                                            {sellerErrors.address.message}
                                        </p>
                                    ) : null}
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="seller-permit-file">
                                        Business permit (PDF or image)
                                    </Label>
                                    <Input
                                        id="seller-permit-file"
                                        type="file"
                                        accept=".pdf,image/*"
                                        onChange={(event) => {
                                            const nextFile = event.target.files?.[0] ?? null;
                                            setPermitFile(nextFile);
                                        }}
                                    />
                                    <p className="text-xs text-zinc-600">
                                        Required for seller verification during registration.
                                    </p>
                                </div>
                                <Button type="submit" disabled={isSellerSubmitting}>
                                    {isSellerSubmitting
                                        ? "Creating seller account..."
                                        : "Register as Seller"}
                                </Button>
                            </form>
                        </TabsContent>
                    </Tabs>

                    <p className="mt-4 text-sm text-zinc-600">
                        Already have an account?{" "}
                        <Link href="/auth/login" className="font-medium text-zinc-900 underline">
                            Login
                        </Link>
                    </p>
                </CardContent>
            </Card>
        </main>
    );
}
