"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Package, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    addCartItem,
    checkoutCart,
    clearCartItems,
    createBuyerAssetUploadUrl,
    getAuthMe,
    getCart,
    getProductDetail,
    getSellerPublicProfile
} from "@/lib/api/endpoints";
import { readMizaStoredUser } from "@/hooks/use-miza-stored-user";
import { writeCheckoutSuccessMeta } from "@/lib/checkout-success-storage";
import { putToSignedUploadUrl } from "@/lib/storage/put-signed-upload";
import { formatCartSelectionsLine } from "@/lib/format-cart-selections";
import { cn, formatPeso, getAppName } from "@/lib/utils";
import type { CartItemResponse, CartItemSelection, ProductDetail, SellerPublicProfile } from "@/types";

type Step = 1 | 2 | 3;

const fieldClass =
    "h-11 w-full border-x-0 border-t-0 border-b border-white/15 rounded-none bg-transparent px-0 text-sm text-foreground placeholder:text-(--muted) focus-visible:border-(--accent)/60 focus-visible:ring-0 focus-visible:outline-none";

const notesClass =
    "min-h-[100px] w-full resize-y border-x-0 border-t-0 border-b border-white/15 rounded-none bg-transparent px-0 py-2 text-sm text-foreground placeholder:text-(--muted) focus-visible:border-(--accent)/60 focus-visible:ring-0 focus-visible:outline-none";

function formatEstimatedDeliveryRange(): string {
    const start = new Date();
    start.setDate(start.getDate() + 7);
    const end = new Date();
    end.setDate(end.getDate() + 14);
    const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
    return `${start.toLocaleDateString(undefined, opts)} – ${end.toLocaleDateString(undefined, opts)}`;
}

function parsePrepareSpecs(raw: string | null): CartItemSelection[] {
    if (!raw) {
        return [];
    }
    try {
        const parsed = JSON.parse(decodeURIComponent(raw)) as unknown;
        if (!Array.isArray(parsed)) {
            return [];
        }
        const out: CartItemSelection[] = [];
        for (const x of parsed) {
            if (!x || typeof x !== "object") {
                continue;
            }
            const row = x as { optionId?: unknown; value?: unknown };
            if (typeof row.optionId === "string" && typeof row.value === "string") {
                out.push({ optionId: row.optionId, value: row.value });
            }
        }
        return out;
    } catch {
        return [];
    }
}

function StepChip({
    n,
    label,
    active,
    done
}: {
    n: number;
    label: string;
    active: boolean;
    done: boolean;
}) {
    return (
        <div className="flex flex-1 flex-col items-center gap-2 sm:flex-row sm:justify-center sm:gap-3">
            <div
                className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center text-xs font-bold transition-colors",
                    active
                        ? "bg-(--accent) text-[#030608]"
                        : done
                          ? "bg-(--accent)/25 text-(--accent)"
                          : "border border-white/20 bg-transparent text-(--muted)"
                )}
            >
                {done ? "✓" : n}
            </div>
            <span
                className={cn(
                    "text-center text-[10px] font-semibold uppercase tracking-[0.18em] sm:text-left",
                    active || done ? "text-(--accent)" : "text-(--muted)"
                )}
            >
                {label}
            </span>
        </div>
    );
}

type OnlineSellerPayState = {
    methodId: string;
    receiptUrl: string;
    receiptUploading: boolean;
};

export function BuyerCheckoutClient() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const appName = getAppName();
    const prepareHandled = useRef(false);

    const [step, setStep] = useState<Step>(1);
    const [cartItems, setCartItems] = useState<CartItemResponse[]>([]);
    const [productMap, setProductMap] = useState<Record<string, ProductDetail>>({});
    const [loadingCart, setLoadingCart] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");
    const [addressLine, setAddressLine] = useState("");
    const [city, setCity] = useState("");
    const [postalCode, setPostalCode] = useState("");
    const [deliveryNotes, setDeliveryNotes] = useState("");

    const [paymentMethod, setPaymentMethod] = useState<"cash" | "online">("cash");
    const [sellerProfiles, setSellerProfiles] = useState<Record<string, SellerPublicProfile>>({});
    const [onlineBySeller, setOnlineBySeller] = useState<Record<string, OnlineSellerPayState>>({});

    const loadCartAndProducts = useCallback(async () => {
        setLoadingCart(true);
        try {
            const { data } = await getCart();
            setCartItems(data);
            const nextMap: Record<string, ProductDetail> = {};
            await Promise.all(
                data.map(async (item) => {
                    try {
                        const r = await getProductDetail(item.productId);
                        nextMap[item.productId] = r.data;
                    } catch {
                        /* product missing */
                    }
                })
            );
            setProductMap(nextMap);
        } catch {
            setCartItems([]);
        } finally {
            setLoadingCart(false);
        }
    }, []);

    useEffect(() => {
        const pb = searchParams.get("prepareBuy");
        const q = searchParams.get("qty");
        if (!pb || !q || prepareHandled.current) {
            return;
        }
        prepareHandled.current = true;
        const prepareSpecs = parsePrepareSpecs(searchParams.get("specs"));
        let cancelled = false;
        void (async () => {
            try {
                await clearCartItems();
                await addCartItem(pb, Math.max(1, Math.floor(Number(q)) || 1), prepareSpecs);
            } catch {
                if (!cancelled) {
                    toast.error("We couldn't prepare checkout. Try again from the product page.");
                }
            }
            if (!cancelled) {
                router.replace("/buyer/checkout");
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [searchParams, router]);

    useEffect(() => {
        if (searchParams.get("prepareBuy")) {
            return;
        }
        void loadCartAndProducts();
    }, [searchParams, loadCartAndProducts]);

    useEffect(() => {
        if (searchParams.get("prepareBuy")) {
            return;
        }
        const onAuthChange = () => {
            void loadCartAndProducts();
        };
        window.addEventListener("miza-auth-change", onAuthChange);
        return () => window.removeEventListener("miza-auth-change", onAuthChange);
    }, [searchParams, loadCartAndProducts]);

    useEffect(() => {
        if (searchParams.get("prepareBuy")) {
            return;
        }
        let cancelled = false;
        const local = readMizaStoredUser();
        if (local?.email) {
            setEmail((prev) => (prev.trim() ? prev : local.email));
        }
        if (local?.fullName?.trim()) {
            setFullName((prev) => (prev.trim() ? prev : local.fullName!.trim()));
        }
        void getAuthMe()
            .then((res) => {
                if (cancelled || !res.user) {
                    return;
                }
                const u = res.user;
                if (u.email) {
                    setEmail(u.email);
                }
                if (u.fullName?.trim()) {
                    setFullName(u.fullName.trim());
                }
            })
            .catch(() => {
                /* keep localStorage-backed values */
            });
        return () => {
            cancelled = true;
        };
    }, [searchParams]);

    const subtotal = useMemo(() => {
        return cartItems.reduce((sum, item) => {
            const p = productMap[item.productId];
            const unit = p?.basePrice ?? 0;
            return sum + unit * item.quantity;
        }, 0);
    }, [cartItems, productMap]);

    const sellerCheckoutGroups = useMemo(() => {
        const m = new Map<string, CartItemResponse[]>();
        for (const item of cartItems) {
            const p = productMap[item.productId];
            if (!p?.sellerId) {
                continue;
            }
            const arr = m.get(p.sellerId) ?? [];
            arr.push(item);
            m.set(p.sellerId, arr);
        }
        return [...m.entries()].map(([sellerId, items]) => ({
            sellerId,
            items,
            subtotal: items.reduce((sum, it) => {
                const pr = productMap[it.productId];
                return sum + (pr?.basePrice ?? 0) * it.quantity;
            }, 0)
        }));
    }, [cartItems, productMap]);

    const sellerIdsSignature = sellerCheckoutGroups.map((g) => g.sellerId).sort().join("|");

    useEffect(() => {
        setOnlineBySeller((prev) => {
            const next: Record<string, OnlineSellerPayState> = { ...prev };
            const ids = new Set(sellerCheckoutGroups.map((g) => g.sellerId));
            for (const id of ids) {
                if (!next[id]) {
                    next[id] = { methodId: "", receiptUrl: "", receiptUploading: false };
                }
            }
            for (const k of Object.keys(next)) {
                if (!ids.has(k)) {
                    delete next[k];
                }
            }
            return next;
        });
    }, [sellerIdsSignature]);

    useEffect(() => {
        if (cartItems.length === 0) {
            return;
        }
        const ids = [
            ...new Set(
                cartItems
                    .map((i) => productMap[i.productId]?.sellerId)
                    .filter((x): x is string => Boolean(x))
            )
        ];
        let cancelled = false;
        void Promise.all(
            ids.map(async (sid) => {
                try {
                    const r = await getSellerPublicProfile(sid);
                    if (!cancelled && r.data) {
                        setSellerProfiles((p) => ({ ...p, [sid]: r.data }));
                    }
                } catch {
                    /* ignore */
                }
            })
        );
        return () => {
            cancelled = true;
        };
    }, [cartItems, productMap]);

    const uploadReceiptProof = useCallback(async (sellerId: string, file: File) => {
        setOnlineBySeller((p) => ({
            ...p,
            [sellerId]: {
                ...(p[sellerId] ?? { methodId: "", receiptUrl: "", receiptUploading: false }),
                receiptUploading: true
            }
        }));
        try {
            const target = await createBuyerAssetUploadUrl(file.name, "payment-receipt");
            const put = await putToSignedUploadUrl(target.uploadUrl, file);
            if (!put.ok) {
                throw new Error("Upload failed");
            }
            const url = target.publicUrl ?? target.uploadUrl;
            setOnlineBySeller((p) => ({
                ...p,
                [sellerId]: {
                    ...(p[sellerId] ?? { methodId: "", receiptUrl: "", receiptUploading: false }),
                    receiptUrl: url,
                    receiptUploading: false
                }
            }));
            toast.success("Receipt uploaded");
        } catch {
            toast.error("Could not upload receipt");
            setOnlineBySeller((p) => ({
                ...p,
                [sellerId]: {
                    ...(p[sellerId] ?? { methodId: "", receiptUrl: "", receiptUploading: false }),
                    receiptUploading: false
                }
            }));
        }
    }, []);

    const canContinueStep1 =
        fullName.trim().length > 1 &&
        email.includes("@") &&
        addressLine.trim().length > 3 &&
        city.trim().length > 0 &&
        postalCode.trim().length > 0;

    const canProceedPaymentStep = useMemo(() => {
        if (paymentMethod === "cash") {
            return true;
        }
        if (sellerCheckoutGroups.length === 0) {
            return false;
        }
        for (const g of sellerCheckoutGroups) {
            const profile = sellerProfiles[g.sellerId];
            const methods = profile?.paymentMethods ?? [];
            if (methods.length === 0) {
                return false;
            }
            const row = onlineBySeller[g.sellerId];
            if (!row?.methodId || !row.receiptUrl.trim()) {
                return false;
            }
        }
        return true;
    }, [paymentMethod, sellerCheckoutGroups, sellerProfiles, onlineBySeller]);

    const canPlaceOrder =
        cartItems.length > 0 &&
        (paymentMethod === "cash" || (paymentMethod === "online" && canProceedPaymentStep));

    async function handlePlaceOrder() {
        if (!canPlaceOrder || cartItems.length === 0) {
            return;
        }
        setSubmitting(true);
        try {
            const result = await checkoutCart({
                paymentMethod,
                ...(paymentMethod === "online"
                    ? {
                          onlinePayments: sellerCheckoutGroups.map((g) => ({
                              sellerId: g.sellerId,
                              sellerPaymentMethodId: onlineBySeller[g.sellerId]!.methodId,
                              receiptProofUrl: onlineBySeller[g.sellerId]!.receiptUrl
                          }))
                      }
                    : {})
            });
            const estimatedDeliveryRange = formatEstimatedDeliveryRange();
            const notes = deliveryNotes.trim();
            const orders = result.orders;
            if (orders.length === 1) {
                writeCheckoutSuccessMeta(orders[0].id, {
                    fullName: fullName.trim(),
                    email: email.trim(),
                    addressLine: addressLine.trim(),
                    city: city.trim(),
                    postalCode: postalCode.trim(),
                    ...(notes ? { deliveryNotes: notes } : {}),
                    estimatedDeliveryRange
                });
                toast.success("Order placed");
                router.push(`/buyer/orders/success?orderId=${encodeURIComponent(orders[0].id)}`);
            } else {
                toast.success(`Placed ${orders.length} orders.`);
                router.push("/buyer/orders");
            }
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Checkout failed");
        } finally {
            setSubmitting(false);
        }
    }

    const emptyCart = !loadingCart && cartItems.length === 0;

    const orderSummaryAside = (
        <aside className="lg:sticky lg:top-28 lg:self-start">
            <div className="rounded-xl border border-white/10 bg-[#0c1018]/95 p-6 shadow-[0_0_60px_-24px_rgba(34,199,243,0.28)] backdrop-blur-sm">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-(--accent)">
                    Order summary
                </p>
                <div className="mt-6 max-h-[min(52vh,420px)] space-y-4 overflow-y-auto pr-1">
                    {loadingCart ? (
                        <p className="text-sm text-(--muted)">Loading cart…</p>
                    ) : (
                        cartItems.map((item) => {
                            const p = productMap[item.productId];
                            const thumb =
                                p?.thumbnailUrl?.trim() || p?.media[0]?.url || null;
                            const title = p?.title ?? item.productId;
                            const line = (p?.basePrice ?? 0) * item.quantity;
                            const specLine = formatCartSelectionsLine(p, item.selections);
                            return (
                                <div
                                    key={item.id}
                                    className="flex gap-3 border-b border-white/5 pb-4 last:border-0 last:pb-0"
                                >
                                    <div className="h-16 w-16 shrink-0 overflow-hidden bg-[#12161f]">
                                        {thumb ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                src={thumb}
                                                alt=""
                                                className="h-full w-full object-cover"
                                            />
                                        ) : (
                                            <div className="flex h-full items-center justify-center text-[10px] text-(--muted)">
                                                —
                                            </div>
                                        )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-semibold leading-snug text-foreground">
                                            {title}
                                        </p>
                                        <p className="mt-1 text-xs text-(--muted)">Qty {item.quantity}</p>
                                        {specLine ? (
                                            <p className="mt-1 text-xs text-(--muted)/90">{specLine}</p>
                                        ) : null}
                                        <p className="mt-1 text-sm font-semibold tabular-nums text-(--accent)">
                                            {formatPeso(line)}
                                        </p>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
                <div className="mt-6 space-y-2 border-t border-white/10 pt-6 text-sm">
                    <div className="flex justify-between gap-4 text-(--muted)">
                        <span>Subtotal</span>
                        <span className="shrink-0 tabular-nums text-foreground">
                            {formatPeso(subtotal)}
                        </span>
                    </div>
                    <div className="flex justify-between gap-4 text-(--muted)">
                        <span>Shipping</span>
                        <span className="max-w-[55%] text-right text-xs leading-snug text-foreground">
                            Arranged with seller
                        </span>
                    </div>
                    <div className="flex justify-between gap-4 text-(--muted)">
                        <span>Taxes</span>
                        <span className="text-right text-xs text-foreground">As applicable</span>
                    </div>
                    <div className="flex justify-between border-t border-white/10 pt-3 text-base font-bold">
                        <span>Total</span>
                        <span className="tabular-nums text-(--accent)">{formatPeso(subtotal)}</span>
                    </div>
                    <p className="text-xs leading-relaxed text-(--muted)">
                        Delivery fees and any taxes are confirmed with your seller before payment is
                        finalized.
                    </p>
                </div>
                <div className="mt-6 flex items-start gap-3 border-l-2 border-(--accent)/70 bg-black/25 px-4 py-3">
                    <ShieldCheck
                        className="mt-0.5 h-5 w-5 shrink-0 text-(--accent)"
                        aria-hidden
                    />
                    <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-foreground">
                            Secure checkout
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-(--muted)">
                            Pay only through options your seller shares on the order. Keep proof of
                            payment when required.
                        </p>
                    </div>
                </div>
            </div>
        </aside>
    );

    return (
        <main className="relative min-h-screen flex-1 overflow-hidden bg-[#050508] text-foreground">
            <div
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_-20%,rgba(34,199,243,0.09),transparent)]"
                aria-hidden
            />
            <div className="relative z-10 mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
                <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-4">
                        <Link
                            href="/cart"
                            className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-(--muted) transition hover:text-(--accent)"
                        >
                            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
                            Back to cart
                        </Link>
                        <span className="hidden h-4 w-px bg-white/15 sm:block" aria-hidden />
                        <Link
                            href="/products"
                            className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--muted) transition hover:text-(--accent)"
                        >
                            Continue shopping
                        </Link>
                    </div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-(--accent)">
                        {appName}
                    </p>
                </div>

                <div className="mb-10 flex flex-col items-center gap-6 border-b border-white/10 pb-10">
                    <div className="flex w-full max-w-xl flex-col justify-center gap-6 sm:max-w-2xl sm:flex-row sm:items-start">
                        <StepChip n={1} label="Shipping" active={step === 1} done={step > 1} />
                        <StepChip n={2} label="Payment" active={step === 2} done={step > 2} />
                        <StepChip n={3} label="Review" active={step === 3} done={false} />
                    </div>
                </div>

                {emptyCart ? (
                    <div className="mx-auto max-w-lg rounded-xl border border-white/10 bg-[#080b10] px-8 py-16 text-center">
                        <Package className="mx-auto h-12 w-12 text-(--accent)/40" aria-hidden />
                        <h1 className="mt-6 text-2xl font-bold tracking-tight">Your cart is empty</h1>
                        <p className="mt-3 text-sm text-(--muted)">
                            Add items from the shop, then return here to complete your order.
                        </p>
                        <Link
                            href="/products"
                            className="mt-8 inline-flex h-11 items-center justify-center bg-(--accent) px-8 text-sm font-semibold text-[#030608] transition hover:brightness-110"
                        >
                            Browse products
                        </Link>
                    </div>
                ) : (
                    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)] lg:gap-14 lg:items-start">
                        <div className="min-w-0 space-y-10">
                            {step === 1 ? (
                                <section>
                                    <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                                        Shipping details
                                    </h1>
                                    <p className="mt-3 max-w-xl text-sm leading-relaxed text-(--muted)">
                                        Where should we send this order? Your seller may contact you
                                        to confirm delivery timing and fees.
                                    </p>
                                    <div className="mt-10 grid gap-8 sm:grid-cols-2">
                                        <div>
                                            <Label className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--muted)">
                                                Full name
                                            </Label>
                                            <Input
                                                className={cn(fieldClass, "mt-2")}
                                                value={fullName}
                                                onChange={(e) => setFullName(e.target.value)}
                                                placeholder="Name on the package"
                                                autoComplete="name"
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--muted)">
                                                Email
                                            </Label>
                                            <Input
                                                className={cn(fieldClass, "mt-2")}
                                                type="email"
                                                value={email}
                                                onChange={(e) => setEmail(e.target.value)}
                                                placeholder="you@email.com"
                                                autoComplete="email"
                                            />
                                        </div>
                                        <div className="sm:col-span-2">
                                            <Label className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--muted)">
                                                Street address
                                            </Label>
                                            <Input
                                                className={cn(fieldClass, "mt-2")}
                                                value={addressLine}
                                                onChange={(e) => setAddressLine(e.target.value)}
                                                placeholder="Unit, street, barangay or district"
                                                autoComplete="street-address"
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--muted)">
                                                City
                                            </Label>
                                            <Input
                                                className={cn(fieldClass, "mt-2")}
                                                value={city}
                                                onChange={(e) => setCity(e.target.value)}
                                                autoComplete="address-level2"
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--muted)">
                                                Postal code
                                            </Label>
                                            <Input
                                                className={cn(fieldClass, "mt-2")}
                                                value={postalCode}
                                                onChange={(e) => setPostalCode(e.target.value)}
                                                autoComplete="postal-code"
                                            />
                                        </div>
                                    </div>

                                    <div className="mt-10 border-l-2 border-(--accent) bg-[#080b10]/80 px-5 py-6">
                                        <Label
                                            htmlFor="checkout-delivery-notes"
                                            className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--accent)"
                                        >
                                            Delivery notes
                                        </Label>
                                        <p className="mt-2 text-sm text-(--muted)">
                                            Optional — access instructions, landmarks, or preferred
                                            contact times.
                                        </p>
                                        <Textarea
                                            id="checkout-delivery-notes"
                                            className={cn(notesClass, "mt-4")}
                                            value={deliveryNotes}
                                            onChange={(e) => setDeliveryNotes(e.target.value)}
                                            placeholder="e.g. Gate code, building name, best hours to call"
                                            rows={4}
                                        />
                                    </div>

                                    <div className="mt-10 flex justify-center sm:justify-end">
                                        <Button
                                            type="button"
                                            disabled={!canContinueStep1}
                                            onClick={() => setStep(2)}
                                            className="h-12 w-full max-w-md bg-(--accent) text-xs font-bold uppercase tracking-[0.16em] text-[#030608] hover:brightness-110 sm:w-auto sm:min-w-[240px]"
                                        >
                                            Continue to payment
                                            <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
                                        </Button>
                                    </div>
                                </section>
                            ) : null}

                            {step === 2 ? (
                                <section>
                                    <button
                                        type="button"
                                        onClick={() => setStep(1)}
                                        className="mb-6 inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-(--muted) hover:text-(--accent)"
                                    >
                                        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
                                        Back
                                    </button>
                                    <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                                        Payment
                                    </h1>
                                    <p className="mt-3 max-w-xl text-sm text-(--muted)">
                                        Choose how you plan to pay. The seller may confirm details on
                                        the order or in messages.
                                    </p>
                                    <div className="mt-10 space-y-6">
                                        <div className="flex flex-wrap gap-3">
                                            <button
                                                type="button"
                                                onClick={() => setPaymentMethod("cash")}
                                                className={cn(
                                                    "min-h-11 border px-5 text-xs font-bold uppercase tracking-[0.14em] transition",
                                                    paymentMethod === "cash"
                                                        ? "border-(--accent) bg-(--accent)/10 text-(--accent)"
                                                        : "border-white/15 text-(--muted) hover:border-white/30"
                                                )}
                                            >
                                                Cash on delivery / meet-up
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setPaymentMethod("online")}
                                                className={cn(
                                                    "min-h-11 border px-5 text-xs font-bold uppercase tracking-[0.14em] transition",
                                                    paymentMethod === "online"
                                                        ? "border-(--accent) bg-(--accent)/10 text-(--accent)"
                                                        : "border-white/15 text-(--muted) hover:border-white/30"
                                                )}
                                            >
                                                Online payment
                                            </button>
                                        </div>
                                        {paymentMethod === "online" ? (
                                            <div className="space-y-8">
                                                <p className="text-xs leading-relaxed text-(--muted)">
                                                    Pay each seller using one of their listed methods.
                                                    All items from the same seller share one payment and
                                                    one receipt.
                                                </p>
                                                {sellerCheckoutGroups.map((group) => {
                                                    const profile = sellerProfiles[group.sellerId];
                                                    const methods = profile?.paymentMethods ?? [];
                                                    const row = onlineBySeller[group.sellerId];
                                                    const business =
                                                        profile?.businessName ?? "Seller checkout";
                                                    return (
                                                        <div
                                                            key={group.sellerId}
                                                            className="border border-white/10 bg-[#080b10]/80 px-5 py-6"
                                                        >
                                                            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--accent)">
                                                                {business}
                                                            </p>
                                                            <p className="mt-1 text-xs text-(--muted)">
                                                                {group.items.length} line
                                                                {group.items.length === 1 ? "" : "s"} ·{" "}
                                                                {formatPeso(group.subtotal)}
                                                            </p>
                                                            {methods.length === 0 ? (
                                                                <p className="mt-4 text-sm text-amber-200/90">
                                                                    This seller has not added online
                                                                    payment details. Use cash on delivery
                                                                    or remove their items to continue with
                                                                    online payment.
                                                                </p>
                                                            ) : (
                                                                <>
                                                                    <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-(--muted)">
                                                                        Payment method
                                                                    </p>
                                                                    <div className="mt-3 flex flex-col gap-2">
                                                                        {methods.map((m) => (
                                                                            <label
                                                                                key={m.id}
                                                                                className={cn(
                                                                                    "flex cursor-pointer flex-col gap-1 border px-4 py-3 text-sm transition",
                                                                                    row?.methodId === m.id
                                                                                        ? "border-(--accent) bg-(--accent)/10"
                                                                                        : "border-white/15 hover:border-white/30"
                                                                                )}
                                                                            >
                                                                                <input
                                                                                    type="radio"
                                                                                    className="sr-only"
                                                                                    name={`pay-${group.sellerId}`}
                                                                                    checked={
                                                                                        row?.methodId === m.id
                                                                                    }
                                                                                    onChange={() =>
                                                                                        setOnlineBySeller(
                                                                                            (p) => ({
                                                                                                ...p,
                                                                                                [group.sellerId]:
                                                                                                    {
                                                                                                        ...(p[
                                                                                                            group
                                                                                                                .sellerId
                                                                                                        ] ?? {
                                                                                                            methodId:
                                                                                                                "",
                                                                                                            receiptUrl:
                                                                                                                "",
                                                                                                            receiptUploading:
                                                                                                                false
                                                                                                        }),
                                                                                                        methodId: m.id
                                                                                                    }
                                                                                            })
                                                                                        )
                                                                                    }
                                                                                />
                                                                                <div className="flex flex-wrap items-start justify-between gap-4">
                                                                                    <div className="min-w-0 flex-1 space-y-1">
                                                                                        <span className="block font-semibold text-foreground">
                                                                                            {m.methodName}
                                                                                        </span>
                                                                                        <span className="block text-xs text-(--muted)">
                                                                                            {m.accountName} ·{" "}
                                                                                            {m.accountNumber}
                                                                                        </span>
                                                                                    </div>
                                                                                    {m.qrImageUrl?.trim() ? (
                                                                                        <div className="shrink-0 text-center">
                                                                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                                            <img
                                                                                                src={m.qrImageUrl.trim()}
                                                                                                alt=""
                                                                                                className="mx-auto h-28 w-28 rounded border border-white/15 bg-white object-contain p-1"
                                                                                            />
                                                                                            <p className="mt-1.5 text-[9px] font-medium uppercase tracking-wide text-(--muted)">
                                                                                                Scan to pay
                                                                                            </p>
                                                                                        </div>
                                                                                    ) : null}
                                                                                </div>
                                                                            </label>
                                                                        ))}
                                                                    </div>
                                                                    <div className="mt-6">
                                                                        <Label
                                                                            htmlFor={`receipt-${group.sellerId}`}
                                                                            className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--muted)"
                                                                        >
                                                                            Payment receipt (image)
                                                                        </Label>
                                                                        <input
                                                                            id={`receipt-${group.sellerId}`}
                                                                            type="file"
                                                                            accept="image/*"
                                                                            className="mt-2 block w-full text-xs text-(--muted) file:mr-3 file:border-0 file:bg-(--accent) file:px-3 file:py-2 file:text-[10px] file:font-bold file:uppercase file:tracking-wide file:text-[#030608]"
                                                                            disabled={row?.receiptUploading}
                                                                            onChange={(e) => {
                                                                                const f =
                                                                                    e.target.files?.[0];
                                                                                if (f) {
                                                                                    void uploadReceiptProof(
                                                                                        group.sellerId,
                                                                                        f
                                                                                    );
                                                                                }
                                                                                e.target.value = "";
                                                                            }}
                                                                        />
                                                                        {row?.receiptUploading ? (
                                                                            <p className="mt-2 text-xs text-(--muted)">
                                                                                Uploading…
                                                                            </p>
                                                                        ) : null}
                                                                        {row?.receiptUrl ? (
                                                                            <div className="mt-3 flex items-start gap-3">
                                                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                                <img
                                                                                    src={row.receiptUrl}
                                                                                    alt="Receipt preview"
                                                                                    className="h-24 w-auto max-w-full rounded border border-white/10 object-contain"
                                                                                />
                                                                                <button
                                                                                    type="button"
                                                                                    className="text-[10px] font-semibold uppercase tracking-wide text-(--accent)"
                                                                                    onClick={() =>
                                                                                        setOnlineBySeller(
                                                                                            (p) => ({
                                                                                                ...p,
                                                                                                [group.sellerId]:
                                                                                                    {
                                                                                                        ...(p[
                                                                                                            group
                                                                                                                .sellerId
                                                                                                        ] ?? {
                                                                                                            methodId:
                                                                                                                "",
                                                                                                            receiptUrl:
                                                                                                                "",
                                                                                                            receiptUploading:
                                                                                                                false
                                                                                                        }),
                                                                                                        receiptUrl: ""
                                                                                                    }
                                                                                            })
                                                                                        )
                                                                                    }
                                                                                >
                                                                                    Remove
                                                                                </button>
                                                                            </div>
                                                                        ) : null}
                                                                    </div>
                                                                </>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : null}
                                    </div>
                                    <div className="mt-10 flex justify-center sm:justify-end">
                                        <Button
                                            type="button"
                                            disabled={!canProceedPaymentStep}
                                            onClick={() => setStep(3)}
                                            className="h-12 w-full max-w-md bg-(--accent) text-xs font-bold uppercase tracking-[0.16em] text-[#030608] hover:brightness-110 sm:w-auto sm:min-w-[240px]"
                                        >
                                            Review order
                                            <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
                                        </Button>
                                    </div>
                                </section>
                            ) : null}

                            {step === 3 ? (
                                <section>
                                    <button
                                        type="button"
                                        onClick={() => setStep(2)}
                                        className="mb-6 inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-(--muted) hover:text-(--accent)"
                                    >
                                        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
                                        Back
                                    </button>
                                    <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                                        Review your order
                                    </h1>
                                    <div className="mt-8 space-y-6 rounded-xl border border-white/10 bg-[#080b10]/60 p-6 text-sm">
                                        <div>
                                            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--accent)">
                                                Ship to
                                            </p>
                                            <p className="mt-2 font-medium text-foreground">{fullName}</p>
                                            <p className="text-(--muted)">{email}</p>
                                            <p className="mt-2 text-(--muted)">
                                                {addressLine}, {city} {postalCode}
                                            </p>
                                        </div>
                                        {deliveryNotes.trim() ? (
                                            <div>
                                                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--accent)">
                                                    Delivery notes
                                                </p>
                                                <p className="mt-2 whitespace-pre-wrap text-(--muted)">
                                                    {deliveryNotes.trim()}
                                                </p>
                                            </div>
                                        ) : null}
                                        <div>
                                            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--accent)">
                                                Payment
                                            </p>
                                            {paymentMethod === "cash" ? (
                                                <p className="mt-2 text-foreground">
                                                    Cash on delivery / meet-up
                                                </p>
                                            ) : (
                                                <ul className="mt-3 space-y-4 text-(--muted)">
                                                    {sellerCheckoutGroups.map((g) => {
                                                        const profile = sellerProfiles[g.sellerId];
                                                        const mid = onlineBySeller[g.sellerId]?.methodId;
                                                        const method = profile?.paymentMethods.find(
                                                            (m) => m.id === mid
                                                        );
                                                        return (
                                                            <li key={g.sellerId}>
                                                                <p className="font-medium text-foreground">
                                                                    {profile?.businessName ?? "Seller"}
                                                                </p>
                                                                <p className="mt-1 text-sm">
                                                                    {method
                                                                        ? `${method.methodName} · ${method.accountName}`
                                                                        : "Online payment"}
                                                                </p>
                                                                {method?.qrImageUrl?.trim() ? (
                                                                    <div className="mt-3">
                                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                        <img
                                                                            src={method.qrImageUrl.trim()}
                                                                            alt=""
                                                                            className="h-24 w-24 rounded border border-white/15 bg-white object-contain p-1"
                                                                        />
                                                                    </div>
                                                                ) : null}
                                                                {onlineBySeller[g.sellerId]?.receiptUrl ? (
                                                                    <p className="mt-1 text-xs">
                                                                        Receipt image attached
                                                                    </p>
                                                                ) : null}
                                                            </li>
                                                        );
                                                    })}
                                                </ul>
                                            )}
                                        </div>
                                    </div>
                                    <div className="mt-10 flex justify-center sm:justify-end">
                                        <Button
                                            type="button"
                                            disabled={submitting || !canPlaceOrder}
                                            onClick={() => void handlePlaceOrder()}
                                            className="h-12 w-full max-w-md bg-(--accent) text-xs font-bold uppercase tracking-[0.16em] text-[#030608] hover:brightness-110 sm:w-auto sm:min-w-[260px]"
                                        >
                                            {submitting ? "Placing order…" : "Place order"}
                                        </Button>
                                    </div>
                                </section>
                            ) : null}
                        </div>

                        {orderSummaryAside}
                    </div>
                )}
            </div>
        </main>
    );
}
