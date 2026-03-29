"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, MessageCircle, Package, Settings, ShoppingBag, ShoppingCart } from "lucide-react";
import { LithosUnderlineField } from "@/components/account/lithos-underline-field";
import { ProfileAvatarEditor } from "@/components/account/profile-avatar-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    createBuyerAssetUploadUrl,
    deleteBuyerAccount,
    getAuthMe,
    updateBuyerPassword,
    updateBuyerProfile
} from "@/lib/api/endpoints";
import { useConfirmDialog } from "@/hooks/use-confirm-dialog";
import type { AuthUser } from "@/types";
import { toast } from "sonner";

const inputDark =
    "border-(--border) bg-[#080b10] text-foreground placeholder:text-(--muted) focus-visible:border-(--accent)/50";
const btnPrimary =
    "w-full bg-(--accent) py-6 text-sm font-bold uppercase tracking-[0.18em] text-[#0b0e14] shadow-[0_0_28px_rgba(34,199,243,0.35)] hover:bg-(--accent)/90 md:w-auto md:px-10";

const quickLinks = [
    {
        href: "/buyer/orders",
        label: "My orders",
        description: "Track purchases and order chat",
        icon: ShoppingBag
    },
    {
        href: "/buyer/messages",
        label: "Messages",
        description: "Direct messages with sellers",
        icon: MessageCircle
    },
    {
        href: "/products",
        label: "Browse products",
        description: "Discover stones and sellers",
        icon: Package
    },
    {
        href: "/cart",
        label: "Cart",
        description: "Review items before checkout",
        icon: ShoppingCart
    }
] as const;

function initialsFromNameEmail(name: string, email: string): string {
    const base = name.trim() || email.split("@")[0] || "?";
    const parts = base.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
        return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
    }
    return base.slice(0, 2).toUpperCase();
}

export default function BuyerSettingsPage() {
    const { requestConfirm, dialog: confirmDialog } = useConfirmDialog();
    const [me, setMe] = useState<AuthUser | null>(null);
    const [loadError, setLoadError] = useState(false);
    const [fullName, setFullName] = useState("");
    const [profileImageUrl, setProfileImageUrl] = useState("");
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [deletePassword, setDeletePassword] = useState("");

    useEffect(() => {
        let cancelled = false;
        void getAuthMe()
            .then((res) => {
                if (cancelled) return;
                if (res.user) {
                    setMe(res.user);
                    setFullName(res.user.fullName ?? "");
                    setProfileImageUrl(res.user.profileImageUrl ?? "");
                    setLoadError(false);
                    try {
                        window.localStorage.setItem("miza_user", JSON.stringify(res.user));
                        window.dispatchEvent(new Event("miza-auth-change"));
                    } catch {
                        /* ignore */
                    }
                } else {
                    setMe(null);
                    setLoadError(true);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setLoadError(true);
                    setMe(null);
                }
            });
        return () => {
            cancelled = true;
        };
    }, []);

    async function uploadBuyerProfilePhoto(file: File): Promise<string> {
        const target = await createBuyerAssetUploadUrl(file.name);
        const putRes = await fetch(target.uploadUrl, {
            method: "PUT",
            body: file,
            headers: { "Content-Type": file.type || "application/octet-stream" }
        });
        if (!putRes.ok) {
            throw new Error("Upload failed");
        }
        return target.publicUrl ?? target.uploadUrl;
    }

    const email = me?.email ?? "";
    const initials = initialsFromNameEmail(fullName, email);

    return (
        <main className="min-h-screen flex-1 bg-[#050608] px-4 py-8 md:py-10">
            <div className="mx-auto max-w-6xl">
                <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between lg:gap-12">
                    <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.28em] text-(--muted)">
                            <Settings className="h-3.5 w-3.5 text-(--accent)" aria-hidden />
                            Your account
                        </p>
                        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                            Account settings
                        </h1>
                        <p className="mt-2 max-w-xl text-sm leading-relaxed text-(--muted)">
                            Your profile, marketplace shortcuts, and security preferences.
                        </p>
                    </div>
                    {me ? (
                        <ProfileAvatarEditor
                            imageUrl={profileImageUrl || undefined}
                            initials={initials}
                            inputId="buyer-profile-photo"
                            onFileSelected={(file) => {
                                void uploadBuyerProfilePhoto(file)
                                    .then((url) => {
                                        setProfileImageUrl(url);
                                        toast.success("Profile photo uploaded. Save to apply.");
                                    })
                                    .catch((error) => {
                                        toast.error(
                                            error instanceof Error ? error.message : "Upload failed"
                                        );
                                    });
                            }}
                        />
                    ) : null}
                </div>

                {loadError && !me ? (
                    <p className="mt-8 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                        Could not load your account. Sign in again from the home page.
                    </p>
                ) : null}

                {me ? (
                    <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_320px] lg:gap-10">
                        <div className="space-y-10">
                            <section className="rounded-xl border border-white/10 bg-[#0b0e14] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] md:p-6">
                                <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground">
                                    About you
                                </h2>
                                <p className="mt-1 text-xs text-(--muted)">
                                    How you appear to sellers in messages and order updates.
                                </p>
                                <div className="mt-6 grid gap-5 sm:grid-cols-2">
                                    <LithosUnderlineField
                                        id="buyer-fullName"
                                        label="Legal name"
                                        value={fullName}
                                        onChange={(e) => setFullName(e.target.value)}
                                        autoComplete="name"
                                    />
                                    <LithosUnderlineField
                                        id="buyer-email"
                                        label="Email"
                                        value={email}
                                        readOnly
                                        tabIndex={-1}
                                    />
                                    <div className="sm:col-span-2">
                                        <LithosUnderlineField
                                            id="buyer-profileImageUrl"
                                            label="Profile photo link (optional)"
                                            value={profileImageUrl}
                                            onChange={(e) => setProfileImageUrl(e.target.value)}
                                            placeholder="https://"
                                        />
                                    </div>
                                </div>
                                <Button
                                    type="button"
                                    className={`${btnPrimary} mt-8`}
                                    onClick={async () => {
                                        try {
                                            const res = await updateBuyerProfile({
                                                ...(fullName.trim()
                                                    ? { fullName: fullName.trim() }
                                                    : {}),
                                                ...(profileImageUrl.trim()
                                                    ? { profileImageUrl: profileImageUrl.trim() }
                                                    : {})
                                            });
                                            setMe(res.data);
                                            try {
                                                window.localStorage.setItem(
                                                    "miza_user",
                                                    JSON.stringify(res.data)
                                                );
                                                window.dispatchEvent(new Event("miza-auth-change"));
                                            } catch {
                                                /* ignore */
                                            }
                                            toast.success("Profile saved.");
                                        } catch (error) {
                                            toast.error(
                                                error instanceof Error ? error.message : "Update failed"
                                            );
                                        }
                                    }}
                                >
                                    Save changes
                                </Button>
                            </section>

                            <section>
                                <h2 className="border-l-2 border-(--accent) pl-3 text-sm font-semibold uppercase tracking-wider text-foreground">
                                    Shortcuts
                                </h2>
                                <p className="mt-1 pl-[14px] text-xs text-(--muted)">
                                    Jump back to shopping and support flows.
                                </p>
                                <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                                    {quickLinks.map((item) => {
                                        const Icon = item.icon;
                                        return (
                                            <li key={item.href}>
                                                <Link
                                                    href={item.href}
                                                    className="flex gap-3 rounded-xl border border-white/10 bg-[#0b0e14] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-colors hover:border-(--accent)/35"
                                                >
                                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-(--accent)/10 text-(--accent)">
                                                        <Icon className="h-5 w-5" aria-hidden />
                                                    </span>
                                                    <span className="min-w-0">
                                                        <span className="block text-sm font-semibold text-foreground">
                                                            {item.label}
                                                        </span>
                                                        <span className="mt-0.5 block text-xs text-(--muted)">
                                                            {item.description}
                                                        </span>
                                                    </span>
                                                </Link>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </section>

                            <section className="rounded-xl border border-white/10 bg-[#0b0e14] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                                <div className="border-b border-white/10 px-5 py-4 md:px-6">
                                    <h2 className="text-sm font-semibold text-foreground">Security</h2>
                                    <p className="mt-1 text-xs text-(--muted)">
                                        Change your password or permanently delete this account.
                                    </p>
                                </div>
                                <div className="grid gap-6 p-5 md:p-6">
                                    <div className="grid gap-3 rounded-lg border border-white/10 bg-[#080b10]/50 p-4">
                                        <p className="text-xs font-medium text-(--muted)">Update password</p>
                                        <Label htmlFor="buyer-current-password" className="text-(--muted)">
                                            Current password
                                        </Label>
                                        <Input
                                            id="buyer-current-password"
                                            type="password"
                                            autoComplete="current-password"
                                            className={inputDark}
                                            value={currentPassword}
                                            onChange={(e) => setCurrentPassword(e.target.value)}
                                        />
                                        <Label htmlFor="buyer-new-password" className="text-(--muted)">
                                            New password
                                        </Label>
                                        <Input
                                            id="buyer-new-password"
                                            type="password"
                                            autoComplete="new-password"
                                            className={inputDark}
                                            value={newPassword}
                                            onChange={(e) => setNewPassword(e.target.value)}
                                        />
                                        <Button
                                            type="button"
                                            className="w-fit bg-(--accent) font-semibold uppercase tracking-wide text-[#050608]"
                                            onClick={async () => {
                                                try {
                                                    await updateBuyerPassword(currentPassword, newPassword);
                                                    setCurrentPassword("");
                                                    setNewPassword("");
                                                    toast.success("Password updated.");
                                                } catch (error) {
                                                    const msg =
                                                        error instanceof Error
                                                            ? error.message
                                                            : "Password update failed";
                                                    toast.error(msg);
                                                }
                                            }}
                                        >
                                            Update password
                                        </Button>
                                    </div>

                                    <div className="rounded-lg border border-red-500/35 bg-red-950/20 p-4">
                                        <p className="text-xs font-medium text-red-200">Close account</p>
                                        <p className="mt-1 text-[11px] text-(--muted)">
                                            This removes your buyer account and associated data. This cannot be
                                            undone.
                                        </p>
                                        <Label htmlFor="buyer-delete-password" className="mt-3 block text-(--muted)">
                                            Enter password to confirm
                                        </Label>
                                        <Input
                                            id="buyer-delete-password"
                                            type="password"
                                            autoComplete="current-password"
                                            className={inputDark}
                                            value={deletePassword}
                                            onChange={(e) => setDeletePassword(e.target.value)}
                                        />
                                        <Button
                                            type="button"
                                            variant="outline"
                                            className="mt-3 border-red-500/40 text-red-300 hover:bg-red-950/40"
                                            onClick={async () => {
                                                try {
                                                    await deleteBuyerAccount(deletePassword);
                                                    window.localStorage.removeItem("miza_token");
                                                    window.localStorage.removeItem("miza_user");
                                                    await fetch("/api/auth/session", { method: "DELETE" });
                                                    window.dispatchEvent(new Event("miza-auth-change"));
                                                    window.location.href = "/";
                                                } catch (error) {
                                                    toast.error(
                                                        error instanceof Error ? error.message : "Delete failed"
                                                    );
                                                }
                                            }}
                                        >
                                            Delete account
                                        </Button>
                                    </div>
                                </div>
                            </section>
                        </div>

                        <aside className="space-y-4">
                            <div className="rounded-xl border border-(--accent)/25 bg-[#080b10] p-5 shadow-[0_0_32px_rgba(34,199,243,0.12)]">
                                <div className="flex items-start gap-3">
                                    <CheckCircle2 className="h-5 w-5 shrink-0 text-(--accent)" />
                                    <div>
                                        <p className="text-sm font-semibold text-foreground">Buyer account</p>
                                        <p className="mt-1 text-xs text-(--muted)">
                                            Browse specimens, checkout, and message sellers.
                                        </p>
                                    </div>
                                </div>
                                <dl className="mt-5 space-y-3 border-t border-white/10 pt-4 text-[10px] uppercase tracking-wider">
                                    <div className="flex justify-between gap-2">
                                        <dt className="text-(--muted)">Shopping</dt>
                                        <dd className="font-semibold text-(--accent)">Active</dd>
                                    </div>
                                    <div className="flex justify-between gap-2">
                                        <dt className="text-(--muted)">Role</dt>
                                        <dd className="text-foreground">Buyer</dd>
                                    </div>
                                </dl>
                            </div>
                            <div className="rounded-xl border border-white/10 bg-[#080b10]/60 p-4">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-(--muted)">
                                    Quick notes
                                </p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    <span className="rounded-full border border-(--accent)/35 bg-(--accent)/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-(--accent)">
                                        Security: password
                                    </span>
                                </div>
                            </div>
                        </aside>
                    </div>
                ) : null}
            </div>
            {confirmDialog}
        </main>
    );
}
