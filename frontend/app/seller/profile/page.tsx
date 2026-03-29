"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Pencil, Trash2 } from "lucide-react";
import { LithosImageUploader } from "@/components/account/lithos-image-uploader";
import { LithosUnderlineField } from "@/components/account/lithos-underline-field";
import { ProfileAvatarEditor } from "@/components/account/profile-avatar-editor";
import { AdminSellerLocationMap } from "@/components/admin/admin-seller-location-map";
import { SellerShopMapPicker } from "@/components/auth/seller-shop-map-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    createSellerAssetUploadUrl,
    createSellerPaymentMethod,
    deleteSellerAccount,
    deleteSellerPaymentMethod,
    getSellerPaymentMethods,
    getSellerProfile,
    signSellerAssetReadUrl,
    submitSellerLocationRequest,
    updateSellerPaymentMethod,
    updateSellerPassword,
    updateSellerProfile
} from "@/lib/api/endpoints";
import { putToSignedUploadUrl } from "@/lib/storage/put-signed-upload";
import { useConfirmDialog } from "@/hooks/use-confirm-dialog";
import type { SellerPaymentMethod, SellerPublicProfile } from "@/types";
import { toast } from "sonner";

const inputDark =
    "border-(--border) bg-[#080b10] text-foreground placeholder:text-(--muted) focus-visible:border-(--accent)/50";
const btnPrimary =
    "w-full bg-(--accent) py-6 text-sm font-bold uppercase tracking-[0.18em] text-[#0b0e14] shadow-[0_0_28px_rgba(34,199,243,0.35)] hover:bg-(--accent)/90 md:w-auto md:px-10";
const tabNavBtn =
    "rounded-none border-b-2 border-transparent bg-transparent px-0 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-(--muted) shadow-none data-[state=active]:border-(--accent) data-[state=active]:bg-transparent data-[state=active]:text-(--accent) data-[state=active]:shadow-none";

function initialsFromNameEmail(name: string, email: string): string {
    const base = name.trim() || email.split("@")[0] || "?";
    const parts = base.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
        return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
    }
    return base.slice(0, 2).toUpperCase();
}

function PaymentMethodQrPreview({
    url,
    className
}: {
    url?: string;
    className?: string;
}) {
    const [broken, setBroken] = useState(false);
    if (!url || broken) {
        return (
            <div
                className={`flex items-center justify-center rounded-xl border border-dashed border-white/20 bg-black/25 text-center text-[11px] text-(--muted) ${className ?? ""}`}
            >
                No QR image
            </div>
        );
    }
    return (
        // eslint-disable-next-line @next/next/no-img-element -- remote Supabase URLs; domains vary
        <img
            src={url}
            alt=""
            className={`rounded-xl border border-white/15 bg-white object-contain p-2 ${className ?? ""}`}
            onError={() => setBroken(true)}
        />
    );
}

function verificationCopy(status: string): { title: string; detail: string } {
    switch (status) {
        case "approved":
            return {
                title: "Verified seller",
                detail: "You can list and sell on the marketplace."
            };
        case "pending":
            return { title: "Verification pending", detail: "Your documents are being reviewed." };
        case "rejected":
            return {
                title: "Verification required",
                detail: "Resubmit permit documentation to sell."
            };
        default:
            return {
                title: "Not submitted",
                detail: "Complete verification to publish products."
            };
    }
}

export default function SellerProfilePage() {
    const { requestConfirm, dialog: confirmDialog } = useConfirmDialog();
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
    const [paymentAddOpen, setPaymentAddOpen] = useState(false);
    const [paymentEditOpen, setPaymentEditOpen] = useState(false);
    const [paymentEditDraft, setPaymentEditDraft] = useState<SellerPaymentMethod | null>(null);
    const [paymentModalSaving, setPaymentModalSaving] = useState(false);
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmNewPassword, setConfirmNewPassword] = useState("");
    const [deletePassword, setDeletePassword] = useState("");
    const [deleteAccountConfirmOpen, setDeleteAccountConfirmOpen] = useState(false);
    const [shopLatitude, setShopLatitude] = useState<number | undefined>();
    const [shopLongitude, setShopLongitude] = useState<number | undefined>();
    const [locationModalOpen, setLocationModalOpen] = useState(false);
    const [requestLat, setRequestLat] = useState(12.8797);
    const [requestLng, setRequestLng] = useState(121.774);
    const [requestNote, setRequestNote] = useState("");
    const [locationSubmitting, setLocationSubmitting] = useState(false);

    async function uploadSellerAsset(
        file: File,
        kind: "profile" | "background" | "payment-qr"
    ): Promise<{ displayUrl: string; persistUrl: string }> {
        const target = await createSellerAssetUploadUrl(file.name, kind);
        const putRes = await putToSignedUploadUrl(target.uploadUrl, file);
        if (!putRes.ok) {
            throw new Error("Asset upload failed");
        }
        const signed = await signSellerAssetReadUrl(target.path);
        const displayUrl =
            signed.readUrl || target.publicUrl || signed.canonicalUrl;
        return {
            displayUrl,
            persistUrl: signed.canonicalUrl
        };
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
                setShopLatitude(next.shopLatitude);
                setShopLongitude(next.shopLongitude);
            })
            .catch(() => setProfile(null));
        getSellerPaymentMethods()
            .then((response) => setPaymentMethods(response.data))
            .catch(() => setPaymentMethods([]));
    }, []);

    const email = profile?.email ?? "";
    const vStatus = profile?.verificationStatus ?? "unsubmitted";
    const vPresent = verificationCopy(vStatus);
    const initials = initialsFromNameEmail(fullName, email);
    const pendingLocation = profile?.pendingLocationRequest;

    function openLocationRequestModal() {
        setRequestLat(
            Number.isFinite(shopLatitude) && shopLatitude !== undefined ? shopLatitude : 12.8797
        );
        setRequestLng(
            Number.isFinite(shopLongitude) && shopLongitude !== undefined ? shopLongitude : 121.774
        );
        setRequestNote("");
        setLocationModalOpen(true);
    }

    return (
        <div className="bg-[#050608] p-4 md:p-6 md:py-4 lg:p-8 lg:py-4">
            <LithosImageUploader
                id="seller-store-backdrop-upload"
                layout="banner"
                title="Shop banner"
                hint="Wide image behind your public shop page. High contrast and little text work best."
                previewUrl={storeBackgroundUrl || undefined}
                onFileSelected={(file) => {
                    void uploadSellerAsset(file, "background")
                        .then(async ({ displayUrl, persistUrl }) => {
                            setStoreBackgroundUrl(displayUrl);
                            try {
                                await updateSellerProfile({ storeBackgroundUrl: persistUrl });
                                toast.success("Shop banner saved.");
                            } catch (error) {
                                toast.error(
                                    error instanceof Error
                                        ? error.message
                                        : "Could not save banner URL"
                                );
                            }
                        })
                        .catch((error) => {
                            toast.error(error instanceof Error ? error.message : "Upload failed");
                        });
                }}
            />

            <div className="mt-8 flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between lg:gap-12">
                <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-medium uppercase tracking-[0.28em] text-(--muted)">
                        Your account
                    </p>
                    <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                        Account settings
                    </h1>
                    <p className="mt-2 max-w-xl text-sm leading-relaxed text-(--muted)">
                        Configure how buyers see you on the marketplace, how you get paid, and your
                        account security.
                    </p>
                </div>
                {profile ? (
                    <ProfileAvatarEditor
                        imageUrl={profileImageUrl || undefined}
                        initials={initials}
                        inputId="seller-profile-photo"
                        onFileSelected={(file) => {
                            void uploadSellerAsset(file, "profile")
                                .then(async ({ displayUrl, persistUrl }) => {
                                    setProfileImageUrl(displayUrl);
                                    try {
                                        await updateSellerProfile({ profileImageUrl: persistUrl });
                                        toast.success("Profile photo saved.");
                                    } catch (error) {
                                        toast.error(
                                            error instanceof Error
                                                ? error.message
                                                : "Could not save photo URL"
                                        );
                                    }
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

            <div className="mx-auto mt-10 max-w-6xl">
                <div className="rounded-xl border border-white/10 bg-[#0b0e14] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    <div className="border-b border-white/10 px-4 py-4 md:px-6">
                        <Tabs
                            defaultValue={
                                searchParams.get("tab") === "payments" ? "payments" : "profile"
                            }
                        >
                            <TabsList className="h-auto w-full flex-wrap justify-start gap-6 rounded-none border-0 bg-transparent p-0">
                                <TabsTrigger value="profile" className={tabNavBtn}>
                                    Profile
                                </TabsTrigger>
                                <TabsTrigger value="payments" className={tabNavBtn}>
                                    Payment methods
                                </TabsTrigger>
                                <TabsTrigger value="security" className={tabNavBtn}>
                                    Security
                                </TabsTrigger>
                            </TabsList>

                            <TabsContent
                                value="profile"
                                className="mt-6 px-4 pb-6 outline-none md:px-6"
                            >
                                <div className="grid gap-8 lg:grid-cols-[1fr_320px] lg:gap-10">
                                    <div className="space-y-8">
                                        <section>
                                            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground">
                                                About you
                                            </h2>
                                            <p className="mt-1 text-xs text-(--muted)">
                                                How buyers see you on receipts, messages, and your
                                                shop page.
                                            </p>
                                            <div className="mt-5 grid gap-5 sm:grid-cols-2">
                                                <LithosUnderlineField
                                                    id="businessName"
                                                    label="Business name"
                                                    value={businessName}
                                                    onChange={(e) =>
                                                        setBusinessName(e.target.value)
                                                    }
                                                    className="col-span-2"
                                                />
                                                <LithosUnderlineField
                                                    id="fullName"
                                                    label="Legal name"
                                                    value={fullName}
                                                    onChange={(e) => setFullName(e.target.value)}
                                                    autoComplete="name"
                                                />
                                                <LithosUnderlineField
                                                    id="email-ro"
                                                    label="Email"
                                                    value={email}
                                                    readOnly
                                                    tabIndex={-1}
                                                />
                                                <LithosUnderlineField
                                                    id="address"
                                                    label="Shop address"
                                                    value={address}
                                                    onChange={(e) => setAddress(e.target.value)}
                                                    placeholder="Street, city, region"
                                                />
                                                <LithosUnderlineField
                                                    id="contactNumber"
                                                    label="Phone number"
                                                    value={contactNumber}
                                                    onChange={(e) =>
                                                        setContactNumber(e.target.value)
                                                    }
                                                    autoComplete="tel"
                                                />
                                                <div className="sm:col-span-2">
                                                    <div className="rounded-2xl border border-white/10 bg-[#080b10]/60 p-4 md:p-5">
                                                        <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground">
                                                            Shop map pin
                                                        </h3>
                                                        <p className="mt-1 text-xs text-(--muted)">
                                                            Buyers see this location on your public shop page. To
                                                            move the pin, send a request—staff will review it first.
                                                        </p>
                                                        {pendingLocation ? (
                                                            <div
                                                                className="mt-3 rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-100/95"
                                                                role="status"
                                                            >
                                                                <p className="font-medium text-amber-50">
                                                                    Location change pending review
                                                                </p>
                                                                <p className="mt-1 text-amber-100/85">
                                                                    You asked to move the pin to{" "}
                                                                    <span className="tabular-nums">
                                                                        {pendingLocation.requestedLatitude.toFixed(5)}
                                                                        ,{" "}
                                                                        {pendingLocation.requestedLongitude.toFixed(5)}
                                                                    </span>
                                                                    . An admin will approve or decline your request.
                                                                </p>
                                                            </div>
                                                        ) : null}
                                                        <div className="mt-4">
                                                            <AdminSellerLocationMap
                                                                latitude={shopLatitude}
                                                                longitude={shopLongitude}
                                                                address={address}
                                                                sectionHeading="Current pin"
                                                                mapFrameClassName="relative z-0 h-56 w-full overflow-hidden rounded-xl border border-(--border) sm:h-64"
                                                            />
                                                        </div>
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            className="mt-4 border-(--accent)/40 text-(--accent) hover:bg-(--accent)/10"
                                                            disabled={Boolean(pendingLocation)}
                                                            onClick={() => openLocationRequestModal()}
                                                        >
                                                            {pendingLocation
                                                                ? "Request already pending"
                                                                : "Request to change map location"}
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        </section>

                                        <section>
                                            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground">
                                                Your shop
                                            </h2>
                                            <p className="mt-1 text-xs text-(--muted)">
                                                Your business name and optional image links for your
                                                public page.
                                            </p>
                                            <div className="mt-5 grid gap-4 sm:grid-cols-2">
                                                <div className="rounded-lg border-l-4 border-(--accent) bg-[#080b10]/80 p-4">
                                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-(--accent)">
                                                        Active
                                                    </p>
                                                    <p className="mt-2 text-sm font-semibold text-foreground">
                                                        Verified seller account
                                                    </p>
                                                    <p className="mt-1 text-xs text-(--muted)">
                                                        List products, fulfill orders, and message
                                                        buyers.
                                                    </p>
                                                </div>
                                                <div className="rounded-lg border border-white/10 bg-[#080b10]/40 p-4 opacity-60">
                                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-(--muted)">
                                                        Read-only
                                                    </p>
                                                    <p className="mt-2 text-sm font-semibold text-foreground">
                                                        Buyer mode
                                                    </p>
                                                    <p className="mt-1 text-xs text-(--muted)">
                                                        Switching roles requires a separate account.
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="mt-6 space-y-4">
                                                {/* <p className="text-[10px] uppercase tracking-wider text-(--muted)">
                                                    Photo and banner links (optional)
                                                </p>
                                                <div className="grid gap-3 sm:grid-cols-2">
                                                    <LithosUnderlineField
                                                        id="profileImageUrl"
                                                        label="Profile image URL"
                                                        value={profileImageUrl}
                                                        onChange={(e) => setProfileImageUrl(e.target.value)}
                                                        placeholder="https://"
                                                    />
                                                    <LithosUnderlineField
                                                        id="storeBackgroundUrl"
                                                        label="Store background URL"
                                                        value={storeBackgroundUrl}
                                                        onChange={(e) => setStoreBackgroundUrl(e.target.value)}
                                                        placeholder="https://"
                                                    />
                                                </div> */}
                                            </div>
                                        </section>

                                        <Button
                                            type="button"
                                            className={btnPrimary}
                                            onClick={async () => {
                                                try {
                                                    await updateSellerProfile({
                                                        fullName,
                                                        businessName,
                                                        contactNumber,
                                                        address,
                                                        ...(profileImageUrl
                                                            ? { profileImageUrl }
                                                            : {}),
                                                        ...(storeBackgroundUrl
                                                            ? { storeBackgroundUrl }
                                                            : {})
                                                    });
                                                    toast.success("Profile saved.");
                                                } catch (error) {
                                                    toast.error(
                                                        error instanceof Error
                                                            ? error.message
                                                            : "Update failed"
                                                    );
                                                }
                                            }}
                                        >
                                            Save changes
                                        </Button>
                                    </div>

                                    <aside className="space-y-4 lg:pt-0">
                                        <div className="rounded-xl border border-(--accent)/25 bg-[#080b10] p-5 shadow-[0_0_32px_rgba(34,199,243,0.12)]">
                                            <div className="flex items-start gap-3">
                                                <CheckCircle2 className="h-5 w-5 shrink-0 text-(--accent)" />
                                                <div>
                                                    <p className="text-sm font-semibold text-foreground">
                                                        {vPresent.title}
                                                    </p>
                                                    <p className="mt-1 text-xs text-(--muted)">
                                                        {vPresent.detail}
                                                    </p>
                                                </div>
                                            </div>
                                            <dl className="mt-5 space-y-3 border-t border-white/10 pt-4 text-[10px] uppercase tracking-wider">
                                                <div className="flex justify-between gap-2">
                                                    <dt className="text-(--muted)">
                                                        Selling on site
                                                    </dt>
                                                    <dd
                                                        className={
                                                            vStatus === "approved"
                                                                ? "font-semibold text-(--accent)"
                                                                : "text-(--muted)"
                                                        }
                                                    >
                                                        {vStatus === "approved"
                                                            ? "Active"
                                                            : "Limited"}
                                                    </dd>
                                                </div>
                                                <div className="flex justify-between gap-2">
                                                    <dt className="text-(--muted)">
                                                        Live listings
                                                    </dt>
                                                    <dd className="text-foreground">
                                                        {profile?.publishedProducts ?? "—"}
                                                    </dd>
                                                </div>
                                                <div className="flex justify-between gap-2">
                                                    <dt className="text-(--muted)">
                                                        Payout methods
                                                    </dt>
                                                    <dd className="text-foreground">
                                                        {paymentMethods.length}
                                                    </dd>
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
                                                <span className="rounded-full border border-white/15 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-(--muted)">
                                                    Role: seller
                                                </span>
                                            </div>
                                        </div>
                                    </aside>
                                </div>
                            </TabsContent>

                            <TabsContent
                                value="payments"
                                className="mt-6 px-4 pb-6 outline-none md:px-6"
                            >
                                <div className="grid gap-4 rounded-lg border border-white/10 bg-[#080b10]/50 p-4 md:p-6">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <p className="text-xs text-(--muted)">
                                            Manage multiple payment methods for buyer checkout.
                                        </p>
                                        <Button
                                            type="button"
                                            size="sm"
                                            className="bg-(--accent) font-semibold uppercase tracking-wide text-[#050608]"
                                            onClick={() => setPaymentAddOpen(true)}
                                        >
                                            Add payment method
                                        </Button>
                                    </div>
                                    {paymentMethods.length === 0 ? (
                                        <p className="rounded-lg border border-dashed border-(--border) bg-[#080b10]/40 px-4 py-8 text-center text-sm text-(--muted)">
                                            No payment methods yet. Add one so buyers can pay you.
                                        </p>
                                    ) : (
                                        <ul className="grid gap-4 sm:grid-cols-2">
                                            {paymentMethods.map((method) => (
                                                <li
                                                    key={method.id}
                                                    className="relative flex flex-col gap-4 rounded-xl border border-(--border) bg-[#080b10]/70 p-4 pt-10 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:pt-4"
                                                >
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        className="absolute right-2 top-2 h-9 w-9 shrink-0 p-0 text-red-400 hover:bg-red-950/35 hover:text-red-300"
                                                        aria-label="Delete payment method"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            void (async () => {
                                                                const ok = await requestConfirm({
                                                                    title: "Delete this payment method?",
                                                                    description:
                                                                        "Buyers will no longer see it at checkout.",
                                                                    confirmLabel: "Delete",
                                                                    destructive: true
                                                                });
                                                                if (!ok) return;
                                                                try {
                                                                    await deleteSellerPaymentMethod(
                                                                        method.id
                                                                    );
                                                                    setPaymentMethods((prev) =>
                                                                        prev.filter(
                                                                            (entry) =>
                                                                                entry.id !== method.id
                                                                        )
                                                                    );
                                                                    if (
                                                                        paymentEditDraft?.id ===
                                                                        method.id
                                                                    ) {
                                                                        setPaymentEditOpen(false);
                                                                        setPaymentEditDraft(null);
                                                                    }
                                                                    toast.success(
                                                                        "Payment method deleted."
                                                                    );
                                                                } catch (error) {
                                                                    toast.error(
                                                                        error instanceof Error
                                                                            ? error.message
                                                                            : "Delete failed"
                                                                    );
                                                                }
                                                            })();
                                                        }}
                                                    >
                                                        <Trash2 className="h-4 w-4" aria-hidden />
                                                    </Button>
                                                    <PaymentMethodQrPreview
                                                        url={method.qrImageUrl}
                                                        className="mx-auto aspect-square w-full max-w-[200px]"
                                                    />
                                                    <div className="min-w-0 space-y-1 text-center sm:text-left">
                                                        <p className="truncate text-sm font-medium text-foreground">
                                                            {method.accountName}
                                                        </p>
                                                        <p className="font-mono text-sm text-(--muted)">
                                                            {method.accountNumber}
                                                        </p>
                                                    </div>
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        className="mt-auto w-full border-(--border) sm:w-auto"
                                                        onClick={() => {
                                                            setPaymentEditDraft({ ...method });
                                                            setPaymentEditOpen(true);
                                                        }}
                                                    >
                                                        <Pencil className="mr-2 h-3.5 w-3.5" aria-hidden />
                                                        Edit
                                                    </Button>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </TabsContent>

                            <TabsContent
                                value="security"
                                className="mt-6 px-4 pb-6 outline-none md:px-6"
                            >
                                <div className="grid gap-4 rounded-lg border border-white/10 bg-[#080b10]/50 p-4 md:p-6">
                                    <p className="text-xs text-(--muted)">Update password</p>
                                    <Label htmlFor="currentPassword" className="text-(--muted)">
                                        Current password
                                    </Label>
                                    <Input
                                        id="currentPassword"
                                        type="password"
                                        className={inputDark}
                                        value={currentPassword}
                                        onChange={(e) => setCurrentPassword(e.target.value)}
                                    />
                                    <Label htmlFor="newPassword" className="text-(--muted)">
                                        New password
                                    </Label>
                                    <Input
                                        id="newPassword"
                                        type="password"
                                        className={inputDark}
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        autoComplete="new-password"
                                    />
                                    <Label htmlFor="confirmNewPassword" className="text-(--muted)">
                                        Confirm new password
                                    </Label>
                                    <Input
                                        id="confirmNewPassword"
                                        type="password"
                                        className={inputDark}
                                        value={confirmNewPassword}
                                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                                        autoComplete="new-password"
                                    />
                                    <Button
                                        type="button"
                                        className="w-fit bg-(--accent) font-semibold uppercase tracking-wide text-[#050608]"
                                        onClick={async () => {
                                            if (newPassword !== confirmNewPassword) {
                                                toast.error("New password and confirmation do not match.");
                                                return;
                                            }
                                            try {
                                                await updateSellerPassword(
                                                    currentPassword,
                                                    newPassword
                                                );
                                                setCurrentPassword("");
                                                setNewPassword("");
                                                setConfirmNewPassword("");
                                                toast.success("Password updated.");
                                            } catch (error) {
                                                toast.error(
                                                    error instanceof Error
                                                        ? error.message
                                                        : "Password update failed"
                                                );
                                            }
                                        }}
                                    >
                                        Update password
                                    </Button>
                                    <div className="mt-3 rounded-md border border-red-500/35 bg-red-950/20 p-3">
                                        <p className="text-xs font-medium text-red-200">
                                            Close account
                                        </p>
                                        <p className="mt-1 text-[11px] text-(--muted)">
                                            Permanently delete this seller account. This cannot be
                                            undone.
                                        </p>
                                        {!deleteAccountConfirmOpen ? (
                                            <Button
                                                type="button"
                                                variant="outline"
                                                className="mt-3 border-red-500/40 text-red-300 hover:bg-red-950/40"
                                                onClick={() => setDeleteAccountConfirmOpen(true)}
                                            >
                                                Delete Account
                                            </Button>
                                        ) : (
                                            <>
                                                <Label
                                                    htmlFor="deletePassword"
                                                    className="mt-3 block text-(--muted)"
                                                >
                                                    Enter password to confirm
                                                </Label>
                                                <Input
                                                    id="deletePassword"
                                                    type="password"
                                                    className={`${inputDark} mt-1`}
                                                    value={deletePassword}
                                                    onChange={(e) => setDeletePassword(e.target.value)}
                                                    autoComplete="current-password"
                                                />
                                                <div className="mt-3 flex flex-wrap gap-2">
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        className="border-(--border) text-foreground hover:bg-(--surface-elevated)"
                                                        onClick={() => {
                                                            setDeleteAccountConfirmOpen(false);
                                                            setDeletePassword("");
                                                        }}
                                                    >
                                                        Cancel
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        className="border-red-500/40 text-red-300 hover:bg-red-950/40"
                                                        onClick={async () => {
                                                            const ok = await requestConfirm({
                                                                title:
                                                                    "Delete your seller account permanently?",
                                                                description:
                                                                    "Your seller profile, payment methods, and access will be removed. This cannot be undone.",
                                                                confirmLabel: "Delete account",
                                                                destructive: true
                                                            });
                                                            if (!ok) return;
                                                            try {
                                                                await deleteSellerAccount(
                                                                    deletePassword
                                                                );
                                                                localStorage.removeItem("miza_token");
                                                                localStorage.removeItem("miza_user");
                                                                await fetch("/api/auth/session", {
                                                                    method: "DELETE"
                                                                });
                                                                window.dispatchEvent(
                                                                    new Event("miza-auth-change")
                                                                );
                                                                window.location.href = "/";
                                                            } catch (error) {
                                                                toast.error(
                                                                    error instanceof Error
                                                                        ? error.message
                                                                        : "Delete failed"
                                                                );
                                                            }
                                                        }}
                                                    >
                                                        Delete account
                                                    </Button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </TabsContent>
                        </Tabs>
                        {!profile ? (
                            <p className="mt-4 rounded-md border border-(--border) bg-[#080b10]/50 px-3 py-2 text-(--muted)">
                                Sign in to view your profile.
                            </p>
                        ) : null}
                    </div>
                </div>
            </div>

            {paymentAddOpen ? (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
                    role="presentation"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setPaymentAddOpen(false);
                    }}
                >
                    <div
                        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-[#0b0e14] p-5 shadow-xl md:p-6"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="payment-add-title"
                    >
                        <h2
                            id="payment-add-title"
                            className="text-sm font-semibold uppercase tracking-[0.18em] text-foreground"
                        >
                            Add payment method
                        </h2>
                        <p className="mt-2 text-xs text-(--muted)">
                            Buyers will see these details at checkout when they choose online payment.
                        </p>
                        <div className="mt-4 grid gap-3">
                            <div className="grid gap-2">
                                <Label htmlFor="modal-new-method-name" className="text-(--muted)">
                                    Method name
                                </Label>
                                <Input
                                    id="modal-new-method-name"
                                    className={inputDark}
                                    value={newMethodName}
                                    onChange={(e) => setNewMethodName(e.target.value)}
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="modal-new-account-name" className="text-(--muted)">
                                    Account name
                                </Label>
                                <Input
                                    id="modal-new-account-name"
                                    className={inputDark}
                                    value={newAccountName}
                                    onChange={(e) => setNewAccountName(e.target.value)}
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="modal-new-account-number" className="text-(--muted)">
                                    Account number
                                </Label>
                                <Input
                                    id="modal-new-account-number"
                                    className={inputDark}
                                    value={newAccountNumber}
                                    onChange={(e) => setNewAccountNumber(e.target.value)}
                                />
                            </div>
                            <LithosImageUploader
                                id="modal-new-payment-qr-upload"
                                layout="banner"
                                title="Payment QR"
                                hint="Optional QR code buyers can scan to pay you."
                                previewUrl={newQrImageUrl || undefined}
                                onFileSelected={(file) => {
                                    void uploadSellerAsset(file, "payment-qr")
                                        .then(({ displayUrl }) => {
                                            setNewQrImageUrl(displayUrl);
                                            toast.success("Payment QR uploaded.");
                                        })
                                        .catch((error) => {
                                            toast.error(
                                                error instanceof Error ? error.message : "Upload failed"
                                            );
                                        });
                                }}
                            />
                        </div>
                        <div className="mt-5 flex flex-wrap gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                className="border-(--border)"
                                onClick={() => setPaymentAddOpen(false)}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="button"
                                className="bg-(--accent) font-semibold text-[#050608]"
                                disabled={paymentModalSaving}
                                onClick={() => {
                                    if (
                                        !newMethodName.trim() ||
                                        !newAccountName.trim() ||
                                        !newAccountNumber.trim()
                                    ) {
                                        toast.error(
                                            "Method name, account name, and account number are required."
                                        );
                                        return;
                                    }
                                    setPaymentModalSaving(true);
                                    void createSellerPaymentMethod({
                                        methodName: newMethodName.trim(),
                                        accountName: newAccountName.trim(),
                                        accountNumber: newAccountNumber.trim(),
                                        ...(newQrImageUrl ? { qrImageUrl: newQrImageUrl } : {})
                                    })
                                        .then(async () => {
                                            const refreshed = await getSellerPaymentMethods();
                                            setPaymentMethods(refreshed.data);
                                            setNewMethodName("");
                                            setNewAccountName("");
                                            setNewAccountNumber("");
                                            setNewQrImageUrl("");
                                            setPaymentAddOpen(false);
                                            toast.success("Payment method added.");
                                        })
                                        .catch((error) => {
                                            toast.error(
                                                error instanceof Error ? error.message : "Add failed"
                                            );
                                        })
                                        .finally(() => setPaymentModalSaving(false));
                                }}
                            >
                                {paymentModalSaving ? "Saving…" : "Add method"}
                            </Button>
                        </div>
                    </div>
                </div>
            ) : null}

            {paymentEditOpen && paymentEditDraft ? (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
                    role="presentation"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) {
                            setPaymentEditOpen(false);
                            setPaymentEditDraft(null);
                        }
                    }}
                >
                    <div
                        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-[#0b0e14] p-5 shadow-xl md:p-6"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="payment-edit-title"
                    >
                        <h2
                            id="payment-edit-title"
                            className="text-sm font-semibold uppercase tracking-[0.18em] text-foreground"
                        >
                            Edit payment method
                        </h2>
                        <p className="mt-2 text-xs text-(--muted)">
                            Update how this option appears at checkout.
                        </p>
                        <div className="mt-4 grid gap-3">
                            <div className="grid gap-2">
                                <Label htmlFor="modal-edit-method-name" className="text-(--muted)">
                                    Method name
                                </Label>
                                <Input
                                    id="modal-edit-method-name"
                                    className={inputDark}
                                    value={paymentEditDraft.methodName}
                                    onChange={(e) =>
                                        setPaymentEditDraft((d) =>
                                            d ? { ...d, methodName: e.target.value } : d
                                        )
                                    }
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="modal-edit-account-name" className="text-(--muted)">
                                    Account name
                                </Label>
                                <Input
                                    id="modal-edit-account-name"
                                    className={inputDark}
                                    value={paymentEditDraft.accountName}
                                    onChange={(e) =>
                                        setPaymentEditDraft((d) =>
                                            d ? { ...d, accountName: e.target.value } : d
                                        )
                                    }
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="modal-edit-account-number" className="text-(--muted)">
                                    Account number
                                </Label>
                                <Input
                                    id="modal-edit-account-number"
                                    className={inputDark}
                                    value={paymentEditDraft.accountNumber}
                                    onChange={(e) =>
                                        setPaymentEditDraft((d) =>
                                            d ? { ...d, accountNumber: e.target.value } : d
                                        )
                                    }
                                />
                            </div>
                            <LithosImageUploader
                                id={`modal-edit-payment-qr-${paymentEditDraft.id}`}
                                layout="banner"
                                title="Payment QR"
                                hint="QR code buyers can scan to pay you."
                                previewUrl={paymentEditDraft.qrImageUrl}
                                onFileSelected={(file) => {
                                    void uploadSellerAsset(file, "payment-qr")
                                        .then(({ displayUrl }) => {
                                            setPaymentEditDraft((d) =>
                                                d ? { ...d, qrImageUrl: displayUrl } : d
                                            );
                                            toast.success("Payment QR uploaded.");
                                        })
                                        .catch((error) => {
                                            toast.error(
                                                error instanceof Error ? error.message : "Upload failed"
                                            );
                                        });
                                }}
                            />
                        </div>
                        <div className="mt-5 flex flex-wrap gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                className="border-(--border)"
                                onClick={() => {
                                    setPaymentEditOpen(false);
                                    setPaymentEditDraft(null);
                                }}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="button"
                                className="bg-(--accent) font-semibold text-[#050608]"
                                disabled={paymentModalSaving}
                                onClick={() => {
                                    const d = paymentEditDraft;
                                    if (
                                        !d.methodName.trim() ||
                                        !d.accountName.trim() ||
                                        !d.accountNumber.trim()
                                    ) {
                                        toast.error(
                                            "Method name, account name, and account number are required."
                                        );
                                        return;
                                    }
                                    setPaymentModalSaving(true);
                                    void updateSellerPaymentMethod(d.id, {
                                        methodName: d.methodName.trim(),
                                        accountName: d.accountName.trim(),
                                        accountNumber: d.accountNumber.trim(),
                                        ...(d.qrImageUrl ? { qrImageUrl: d.qrImageUrl } : {})
                                    })
                                        .then(async () => {
                                            const refreshed = await getSellerPaymentMethods();
                                            setPaymentMethods(refreshed.data);
                                            setPaymentEditOpen(false);
                                            setPaymentEditDraft(null);
                                            toast.success("Payment method updated.");
                                        })
                                        .catch((error) => {
                                            toast.error(
                                                error instanceof Error ? error.message : "Update failed"
                                            );
                                        })
                                        .finally(() => setPaymentModalSaving(false));
                                }}
                            >
                                {paymentModalSaving ? "Saving…" : "Save changes"}
                            </Button>
                        </div>
                    </div>
                </div>
            ) : null}

            {locationModalOpen ? (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
                    role="presentation"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setLocationModalOpen(false);
                    }}
                >
                    <div
                        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-[#0b0e14] p-5 shadow-xl md:p-6"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="location-request-title"
                    >
                        <h2
                            id="location-request-title"
                            className="text-sm font-semibold uppercase tracking-[0.18em] text-foreground"
                        >
                            Proposed shop location
                        </h2>
                        <p className="mt-2 text-xs text-(--muted)">
                            Place the pin where your shop or showroom should appear after approval.
                        </p>
                        <div className="mt-4">
                            <SellerShopMapPicker
                                latitude={requestLat}
                                longitude={requestLng}
                                onPositionChange={(lat, lng) => {
                                    setRequestLat(lat);
                                    setRequestLng(lng);
                                }}
                            />
                        </div>
                        <Label htmlFor="location-req-note" className="mt-4 block text-xs text-(--muted)">
                            Note for admin (optional)
                        </Label>
                        <Textarea
                            id="location-req-note"
                            value={requestNote}
                            onChange={(e) => setRequestNote(e.target.value)}
                            placeholder="e.g. We moved to a new showroom."
                            className={`${inputDark} mt-1 min-h-[72px] resize-y`}
                            maxLength={500}
                        />
                        <div className="mt-5 flex flex-wrap gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                className="border-(--border)"
                                onClick={() => setLocationModalOpen(false)}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="button"
                                className="bg-(--accent) font-semibold text-[#050608]"
                                disabled={locationSubmitting}
                                onClick={() => {
                                    setLocationSubmitting(true);
                                    void submitSellerLocationRequest({
                                        shopLatitude: requestLat,
                                        shopLongitude: requestLng,
                                        ...(requestNote.trim() ? { note: requestNote.trim() } : {})
                                    })
                                        .then(async () => {
                                            toast.success("Request sent. An admin will review your new pin.");
                                            setLocationModalOpen(false);
                                            const refreshed = await getSellerProfile();
                                            const next = refreshed.data;
                                            setProfile(next);
                                            setShopLatitude(next.shopLatitude);
                                            setShopLongitude(next.shopLongitude);
                                        })
                                        .catch((error) => {
                                            toast.error(
                                                error instanceof Error ? error.message : "Request failed"
                                            );
                                        })
                                        .finally(() => setLocationSubmitting(false));
                                }}
                            >
                                {locationSubmitting ? "Sending…" : "Submit request"}
                            </Button>
                        </div>
                    </div>
                </div>
            ) : null}
            {confirmDialog}
        </div>
    );
}
