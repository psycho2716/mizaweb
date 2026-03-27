"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    createSellerAssetUploadUrl,
    createSellerPaymentMethod,
    deleteSellerAccount,
    deleteSellerPaymentMethod,
    getSellerPaymentMethods,
    getSellerProfile,
    updateSellerPaymentMethod,
    updateSellerPassword,
    updateSellerProfile
} from "@/lib/api/endpoints";
import type { SellerPublicProfile } from "@/types";
import type { SellerPaymentMethod } from "@/types";
import { toast } from "sonner";

export default function SellerProfilePage() {
    const searchParams = useSearchParams();
    const [profile, setProfile] = useState<SellerPublicProfile | null>(null);
    const [fullName, setFullName] = useState("");
    const [businessName, setBusinessName] = useState("");
    const [contactNumber, setContactNumber] = useState("");
    const [address, setAddress] = useState("");
    const [profileImageUrl, setProfileImageUrl] = useState("");
    const [storeBackgroundUrl, setStoreBackgroundUrl] = useState("");
    const [paymentMethods, setPaymentMethods] = useState<SellerPaymentMethod[]>([]);
    const [newMethodName, setNewMethodName] = useState("");
    const [newAccountName, setNewAccountName] = useState("");
    const [newAccountNumber, setNewAccountNumber] = useState("");
    const [newQrImageUrl, setNewQrImageUrl] = useState("");
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [deletePassword, setDeletePassword] = useState("");

    async function uploadSellerAsset(
        file: File,
        kind: "profile" | "background" | "payment-qr"
    ): Promise<string> {
        const target = await createSellerAssetUploadUrl(file.name, kind);
        const putRes = await fetch(target.uploadUrl, {
            method: "PUT",
            body: file,
            headers: { "Content-Type": file.type || "application/octet-stream" }
        });
        if (!putRes.ok) {
            throw new Error("Asset upload failed");
        }
        return target.uploadUrl;
    }

    useEffect(() => {
        getSellerProfile()
            .then((response) => {
                const next = response.data;
                setProfile(next);
                setFullName(next.fullName ?? "");
                setBusinessName(next.businessName ?? "");
                setContactNumber(next.contactNumber ?? "");
                setAddress(next.address ?? "");
                setProfileImageUrl(next.profileImageUrl ?? "");
                setStoreBackgroundUrl(next.storeBackgroundUrl ?? "");
            })
            .catch(() => setProfile(null));
        getSellerPaymentMethods()
            .then((response) => setPaymentMethods(response.data))
            .catch(() => setPaymentMethods([]));
    }, []);

    return (
        <main className="mx-auto max-w-3xl p-6">
            <Card>
                <CardHeader>
                    <CardTitle>Profile</CardTitle>
                    <CardDescription>Manage your seller account and store settings.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-2 text-sm text-zinc-800">
                    <Tabs defaultValue={searchParams.get("tab") === "payments" ? "payments" : "profile"}>
                        <TabsList>
                            <TabsTrigger value="profile">Profile</TabsTrigger>
                            <TabsTrigger value="payments">Payment Methods</TabsTrigger>
                            <TabsTrigger value="security">Security</TabsTrigger>
                        </TabsList>

                        <TabsContent value="profile" className="grid gap-3 pt-2">
                            <Label htmlFor="fullName">Full name</Label>
                            <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} />
                            <Label htmlFor="businessName">Business name</Label>
                            <Input id="businessName" value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
                            <Label htmlFor="contactNumber">Contact number</Label>
                            <Input id="contactNumber" value={contactNumber} onChange={(e) => setContactNumber(e.target.value)} />
                            <Label htmlFor="address">Shop location / address</Label>
                            <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} />
                            <Label htmlFor="profileImageUrl">Profile image URL</Label>
                            <Input id="profileImageUrl" value={profileImageUrl} onChange={(e) => setProfileImageUrl(e.target.value)} />
                            <Input
                                type="file"
                                accept="image/*"
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    void uploadSellerAsset(file, "profile")
                                        .then((url) => {
                                            setProfileImageUrl(url);
                                            toast.success("Profile image uploaded.");
                                        })
                                        .catch((error) => {
                                            toast.error(
                                                error instanceof Error
                                                    ? error.message
                                                    : "Upload failed"
                                            );
                                        });
                                }}
                            />
                            <Label htmlFor="storeBackgroundUrl">Store background image URL</Label>
                            <Input id="storeBackgroundUrl" value={storeBackgroundUrl} onChange={(e) => setStoreBackgroundUrl(e.target.value)} />
                            <Input
                                type="file"
                                accept="image/*"
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    void uploadSellerAsset(file, "background")
                                        .then((url) => {
                                            setStoreBackgroundUrl(url);
                                            toast.success("Store background uploaded.");
                                        })
                                        .catch((error) => {
                                            toast.error(
                                                error instanceof Error
                                                    ? error.message
                                                    : "Upload failed"
                                            );
                                        });
                                }}
                            />
                            <Button
                                type="button"
                                onClick={async () => {
                                    try {
                                        await updateSellerProfile({
                                            fullName,
                                            businessName,
                                            contactNumber,
                                            address,
                                            ...(profileImageUrl ? { profileImageUrl } : {}),
                                            ...(storeBackgroundUrl ? { storeBackgroundUrl } : {})
                                        });
                                        toast.success("Profile updated.");
                                    } catch (error) {
                                        toast.error(error instanceof Error ? error.message : "Update failed");
                                    }
                                }}
                            >
                                Save Profile
                            </Button>
                        </TabsContent>

                        <TabsContent value="payments" className="grid gap-3 pt-2">
                            <p className="text-xs text-zinc-500">Manage multiple payment methods.</p>
                            {paymentMethods.map((method) => (
                                <div key={method.id} className="grid gap-2 rounded-md border border-zinc-200 p-3">
                                    <Label htmlFor={`method-${method.id}`}>Method name</Label>
                                    <Input
                                        id={`method-${method.id}`}
                                        value={method.methodName}
                                        onChange={(e) =>
                                            setPaymentMethods((prev) =>
                                                prev.map((entry) =>
                                                    entry.id === method.id
                                                        ? { ...entry, methodName: e.target.value }
                                                        : entry
                                                )
                                            )
                                        }
                                    />
                                    <Label htmlFor={`account-name-${method.id}`}>Account name</Label>
                                    <Input
                                        id={`account-name-${method.id}`}
                                        value={method.accountName}
                                        onChange={(e) =>
                                            setPaymentMethods((prev) =>
                                                prev.map((entry) =>
                                                    entry.id === method.id
                                                        ? { ...entry, accountName: e.target.value }
                                                        : entry
                                                )
                                            )
                                        }
                                    />
                                    <Label htmlFor={`account-number-${method.id}`}>Account number</Label>
                                    <Input
                                        id={`account-number-${method.id}`}
                                        value={method.accountNumber}
                                        onChange={(e) =>
                                            setPaymentMethods((prev) =>
                                                prev.map((entry) =>
                                                    entry.id === method.id
                                                        ? { ...entry, accountNumber: e.target.value }
                                                        : entry
                                                )
                                            )
                                        }
                                    />
                                    <Label htmlFor={`qr-${method.id}`}>QR image URL</Label>
                                    <Input
                                        id={`qr-${method.id}`}
                                        value={method.qrImageUrl ?? ""}
                                        onChange={(e) =>
                                            setPaymentMethods((prev) =>
                                                prev.map((entry) =>
                                                    entry.id === method.id
                                                        ? { ...entry, qrImageUrl: e.target.value }
                                                        : entry
                                                )
                                            )
                                        }
                                    />
                                    <Input
                                        type="file"
                                        accept="image/*"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (!file) return;
                                            void uploadSellerAsset(file, "payment-qr")
                                                .then((url) => {
                                                    setPaymentMethods((prev) =>
                                                        prev.map((entry) =>
                                                            entry.id === method.id
                                                                ? { ...entry, qrImageUrl: url }
                                                                : entry
                                                        )
                                                    );
                                                    toast.success("Payment QR uploaded.");
                                                })
                                                .catch((error) => {
                                                    toast.error(
                                                        error instanceof Error
                                                            ? error.message
                                                            : "Upload failed"
                                                    );
                                                });
                                        }}
                                    />
                                    <div className="flex gap-2">
                                        <Button
                                            type="button"
                                            onClick={async () => {
                                                try {
                                                    await updateSellerPaymentMethod(method.id, {
                                                        methodName: method.methodName,
                                                        accountName: method.accountName,
                                                        accountNumber: method.accountNumber,
                                                        ...(method.qrImageUrl
                                                            ? { qrImageUrl: method.qrImageUrl }
                                                            : {})
                                                    });
                                                    toast.success("Payment method updated.");
                                                } catch (error) {
                                                    toast.error(
                                                        error instanceof Error
                                                            ? error.message
                                                            : "Update failed"
                                                    );
                                                }
                                            }}
                                        >
                                            Save Method
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            className="border-red-300 text-red-700 hover:bg-red-50"
                                            onClick={async () => {
                                                try {
                                                    await deleteSellerPaymentMethod(method.id);
                                                    setPaymentMethods((prev) =>
                                                        prev.filter((entry) => entry.id !== method.id)
                                                    );
                                                    toast.success("Payment method deleted.");
                                                } catch (error) {
                                                    toast.error(
                                                        error instanceof Error
                                                            ? error.message
                                                            : "Delete failed"
                                                    );
                                                }
                                            }}
                                        >
                                            Delete
                                        </Button>
                                    </div>
                                </div>
                            ))}
                            <div className="grid gap-2 rounded-md border border-dashed border-zinc-300 p-3">
                                <p className="text-xs font-medium text-zinc-700">Add new payment method</p>
                                <Label htmlFor="new-payment-method-name">Method name</Label>
                                <Input
                                    id="new-payment-method-name"
                                    value={newMethodName}
                                    onChange={(e) => setNewMethodName(e.target.value)}
                                />
                                <Label htmlFor="new-payment-account-name">Account name</Label>
                                <Input
                                    id="new-payment-account-name"
                                    value={newAccountName}
                                    onChange={(e) => setNewAccountName(e.target.value)}
                                />
                                <Label htmlFor="new-payment-account-number">Account number</Label>
                                <Input
                                    id="new-payment-account-number"
                                    value={newAccountNumber}
                                    onChange={(e) => setNewAccountNumber(e.target.value)}
                                />
                                <Label htmlFor="new-payment-qr">QR image URL</Label>
                                <Input
                                    id="new-payment-qr"
                                    value={newQrImageUrl}
                                    onChange={(e) => setNewQrImageUrl(e.target.value)}
                                />
                                <Input
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (!file) return;
                                        void uploadSellerAsset(file, "payment-qr")
                                            .then((url) => {
                                                setNewQrImageUrl(url);
                                                toast.success("Payment QR uploaded.");
                                            })
                                            .catch((error) => {
                                                toast.error(
                                                    error instanceof Error
                                                        ? error.message
                                                        : "Upload failed"
                                                );
                                            });
                                    }}
                                />
                                <Button
                                    type="button"
                                    onClick={async () => {
                                        if (!newMethodName || !newAccountName || !newAccountNumber) {
                                            toast.error("Method name, account name, and account number are required.");
                                            return;
                                        }
                                        try {
                                            await createSellerPaymentMethod({
                                                methodName: newMethodName,
                                                accountName: newAccountName,
                                                accountNumber: newAccountNumber,
                                                ...(newQrImageUrl ? { qrImageUrl: newQrImageUrl } : {})
                                            });
                                            const refreshed = await getSellerPaymentMethods();
                                            setPaymentMethods(refreshed.data);
                                            setNewMethodName("");
                                            setNewAccountName("");
                                            setNewAccountNumber("");
                                            setNewQrImageUrl("");
                                            toast.success("Payment method added.");
                                        } catch (error) {
                                            toast.error(
                                                error instanceof Error ? error.message : "Add failed"
                                            );
                                        }
                                    }}
                                >
                                    Add Payment Method
                                </Button>
                            </div>
                        </TabsContent>

                        <TabsContent value="security" className="grid gap-3 pt-2">
                            <p className="text-xs text-zinc-500">Update password</p>
                            <Label htmlFor="currentPassword">Current password</Label>
                            <Input id="currentPassword" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
                            <Label htmlFor="newPassword">New password</Label>
                            <Input id="newPassword" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                            <Button
                                type="button"
                                onClick={async () => {
                                    try {
                                        await updateSellerPassword(currentPassword, newPassword);
                                        setCurrentPassword("");
                                        setNewPassword("");
                                        toast.success("Password updated.");
                                    } catch (error) {
                                        toast.error(error instanceof Error ? error.message : "Password update failed");
                                    }
                                }}
                            >
                                Update Password
                            </Button>
                            <div className="mt-3 rounded-md border border-red-200 p-3">
                                <p className="text-xs font-medium text-red-700">Delete account</p>
                                <Label htmlFor="deletePassword" className="mt-2 block">Enter password to confirm</Label>
                                <Input id="deletePassword" type="password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} />
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="mt-2 border-red-300 text-red-700 hover:bg-red-50"
                                    onClick={async () => {
                                        try {
                                            await deleteSellerAccount(deletePassword);
                                            localStorage.removeItem("miza_token");
                                            localStorage.removeItem("miza_user");
                                            await fetch("/api/auth/session", { method: "DELETE" });
                                            window.dispatchEvent(new Event("miza-auth-change"));
                                            window.location.href = "/";
                                        } catch (error) {
                                            toast.error(error instanceof Error ? error.message : "Delete failed");
                                        }
                                    }}
                                >
                                    Delete Account
                                </Button>
                            </div>
                        </TabsContent>
                    </Tabs>
                    {!profile ? <p className="text-zinc-600">Sign in to view your profile.</p> : null}
                </CardContent>
            </Card>
        </main>
    );
}
