"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Package } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    addCartItem,
    checkoutCart,
    clearCartItems,
    getCart,
    getProductDetail
} from "@/lib/api/endpoints";
import { writeCheckoutSuccessMeta } from "@/lib/checkout-success-storage";
import { formatCartSelectionsLine } from "@/lib/format-cart-selections";
import { cn, formatPeso, getAppName } from "@/lib/utils";
import type { CartItemResponse, CartItemSelection, ProductDetail } from "@/types";

type Step = 1 | 2 | 3;

const fieldClass =
    "h-11 w-full border-x-0 border-t-0 border-b border-white/15 rounded-none bg-transparent px-0 text-sm text-foreground placeholder:text-(--muted) focus-visible:border-(--accent)/60 focus-visible:ring-0 focus-visible:outline-none";

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
        <div className="flex flex-1 items-center gap-3">
            <div
                className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center text-xs font-bold transition-colors",
                    active || done
                        ? "bg-(--accent) text-[#030608]"
                        : "border border-white/20 bg-transparent text-(--muted)"
                )}
            >
                {done ? "✓" : n}
            </div>
            <span
                className={cn(
                    "hidden text-[10px] font-semibold uppercase tracking-[0.18em] sm:block",
                    active || done ? "text-(--accent)" : "text-(--muted)"
                )}
            >
                {label}
            </span>
        </div>
    );
}

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
    const [country, setCountry] = useState("Philippines");
    const [largeTruckOk, setLargeTruckOk] = useState(false);
    const [unloadHelpOk, setUnloadHelpOk] = useState(false);
    const [floorNote, setFloorNote] = useState("");

    const [paymentMethod, setPaymentMethod] = useState<"cash" | "online">("cash");
    const [paymentReference, setPaymentReference] = useState("");

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
        let cancelled = false;
        void (async () => {
            setLoadingCart(true);
            try {
                const { data } = await getCart();
                if (cancelled) {
                    return;
                }
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
                if (!cancelled) {
                    setProductMap(nextMap);
                }
            } catch {
                if (!cancelled) {
                    setCartItems([]);
                }
            } finally {
                if (!cancelled) {
                    setLoadingCart(false);
                }
            }
        })();
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

    const canContinueStep1 =
        fullName.trim().length > 1 &&
        email.includes("@") &&
        addressLine.trim().length > 3 &&
        city.trim().length > 0 &&
        postalCode.trim().length > 0 &&
        country.trim().length > 0;

    const canPlaceOrder =
        paymentMethod === "cash" || (paymentMethod === "online" && paymentReference.trim().length > 0);

    async function handlePlaceOrder() {
        if (!canPlaceOrder || cartItems.length === 0) {
            return;
        }
        setSubmitting(true);
        try {
            const result = await checkoutCart({
                paymentMethod,
                ...(paymentMethod === "online" && paymentReference.trim()
                    ? { paymentReference: paymentReference.trim() }
                    : {})
            });
            const estimatedDeliveryRange = formatEstimatedDeliveryRange();
            writeCheckoutSuccessMeta(result.id, {
                fullName: fullName.trim(),
                email: email.trim(),
                addressLine: addressLine.trim(),
                city: city.trim(),
                postalCode: postalCode.trim(),
                country: country.trim(),
                largeTruckOk,
                unloadHelpOk,
                floorNote: floorNote.trim(),
                estimatedDeliveryRange
            });
            toast.success("Order placed");
            router.push(`/buyer/orders/success?orderId=${encodeURIComponent(result.id)}`);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Checkout failed");
        } finally {
            setSubmitting(false);
        }
    }

    const emptyCart = !loadingCart && cartItems.length === 0;

    return (
        <main className="relative min-h-screen flex-1 overflow-hidden bg-[#050508] text-foreground">
            <div
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_-20%,rgba(34,199,243,0.09),transparent)]"
                aria-hidden
            />
            <div className="relative z-10 mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
                <div className="mb-10 flex flex-wrap items-center justify-between gap-4">
                    <Link
                        href="/products"
                        className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-(--muted) transition hover:text-(--accent)"
                    >
                        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
                        Back to shop
                    </Link>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-(--accent)">
                        {appName}
                    </p>
                </div>

                <div className="mb-10 flex flex-col gap-4 border-b border-white/10 pb-8 sm:flex-row sm:items-center">
                    <StepChip n={1} label="Shipping" active={step === 1} done={step > 1} />
                    <div className="hidden h-px flex-1 bg-white/10 sm:block" aria-hidden />
                    <StepChip n={2} label="Payment" active={step === 2} done={step > 2} />
                    <div className="hidden h-px flex-1 bg-white/10 sm:block" aria-hidden />
                    <StepChip n={3} label="Review" active={step === 3} done={false} />
                </div>

                {emptyCart ? (
                    <div className="mx-auto max-w-lg rounded-xl border border-white/10 bg-[#080b10] px-8 py-16 text-center">
                        <Package className="mx-auto h-12 w-12 text-(--accent)/40" aria-hidden />
                        <h1 className="mt-6 text-2xl font-bold tracking-tight">Your cart is empty</h1>
                        <p className="mt-3 text-sm text-(--muted)">
                            Add something you love, then come back here to finish your order.
                        </p>
                        <Link
                            href="/products"
                            className="mt-8 inline-flex h-11 items-center justify-center bg-(--accent) px-8 text-sm font-semibold text-[#030608] transition hover:brightness-110"
                        >
                            Browse products
                        </Link>
                    </div>
                ) : (
                    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)] lg:gap-14">
                        <div className="min-w-0 space-y-10">
                            {step === 1 ? (
                                <section>
                                    <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                                        Shipping & delivery
                                    </h1>
                                    <p className="mt-3 max-w-xl text-sm leading-relaxed text-(--muted)">
                                        Tell us where to send your order. Heavy stone pieces may need
                                        a large truck or help unloading—we use this to coordinate with
                                        the seller.
                                    </p>
                                    <div className="mt-10 grid gap-8 sm:grid-cols-2">
                                        <div className="sm:col-span-2">
                                            <Label className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--muted)">
                                                Full name
                                            </Label>
                                            <Input
                                                className={cn(fieldClass, "mt-2")}
                                                value={fullName}
                                                onChange={(e) => setFullName(e.target.value)}
                                                placeholder="Your name"
                                                autoComplete="name"
                                            />
                                        </div>
                                        <div className="sm:col-span-2">
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
                                                placeholder="House / unit, street, area"
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
                                        <div className="sm:col-span-2">
                                            <Label className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--muted)">
                                                Country
                                            </Label>
                                            <select
                                                className={cn(
                                                    fieldClass,
                                                    "mt-2 cursor-pointer bg-[#050508] py-2"
                                                )}
                                                value={country}
                                                onChange={(e) => setCountry(e.target.value)}
                                            >
                                                <option value="Philippines">Philippines</option>
                                                <option value="Other">Other</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div className="mt-10 border-l-2 border-(--accent) bg-[#080b10]/80 px-5 py-6">
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-(--accent)">
                                            Delivery requirements
                                        </p>
                                        <p className="mt-2 text-sm text-(--muted)">
                                            Help the seller plan delivery to your location.
                                        </p>
                                        <label className="mt-5 flex cursor-pointer items-start gap-3 text-sm">
                                            <input
                                                type="checkbox"
                                                checked={largeTruckOk}
                                                onChange={(e) => setLargeTruckOk(e.target.checked)}
                                                className="mt-1 h-4 w-4 rounded border-white/30 bg-transparent text-(--accent) focus:ring-(--accent)/40"
                                            />
                                            <span>A large delivery truck can reach my address</span>
                                        </label>
                                        <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm">
                                            <input
                                                type="checkbox"
                                                checked={unloadHelpOk}
                                                onChange={(e) => setUnloadHelpOk(e.target.checked)}
                                                className="mt-1 h-4 w-4 rounded border-white/30 bg-transparent text-(--accent) focus:ring-(--accent)/40"
                                            />
                                            <span>
                                                I have a safe way to unload heavy items (e.g. crew or
                                                equipment on site)
                                            </span>
                                        </label>
                                        <div className="mt-6">
                                            <Label className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--muted)">
                                                Floor or building note (optional)
                                            </Label>
                                            <Input
                                                className={cn(fieldClass, "mt-2")}
                                                value={floorNote}
                                                onChange={(e) => setFloorNote(e.target.value)}
                                                placeholder="e.g. 3rd floor, gate code, landmark"
                                            />
                                        </div>
                                    </div>

                                    <div className="mt-10 flex justify-end">
                                        <Button
                                            type="button"
                                            disabled={!canContinueStep1}
                                            onClick={() => setStep(2)}
                                            className="h-12 min-w-[200px] bg-(--accent) text-xs font-bold uppercase tracking-[0.16em] text-[#030608] hover:brightness-110"
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
                                        Choose how you will pay. The seller may confirm details with
                                        you in chat or on the order.
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
                                            <div>
                                                <Label className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--muted)">
                                                    Payment reference
                                                </Label>
                                                <Input
                                                    className={cn(fieldClass, "mt-2")}
                                                    value={paymentReference}
                                                    onChange={(e) => setPaymentReference(e.target.value)}
                                                    placeholder="Reference number or receipt ID"
                                                />
                                            </div>
                                        ) : null}
                                    </div>
                                    <div className="mt-10 flex justify-end">
                                        <Button
                                            type="button"
                                            onClick={() => setStep(3)}
                                            className="h-12 min-w-[200px] bg-(--accent) text-xs font-bold uppercase tracking-[0.16em] text-[#030608] hover:brightness-110"
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
                                        Review & place order
                                    </h1>
                                    <div className="mt-8 space-y-6 rounded-xl border border-white/10 bg-[#080b10]/60 p-6 text-sm">
                                        <div>
                                            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--accent)">
                                                Ship to
                                            </p>
                                            <p className="mt-2 font-medium text-foreground">
                                                {fullName}
                                            </p>
                                            <p className="text-(--muted)">{email}</p>
                                            <p className="mt-2 text-(--muted)">
                                                {addressLine}, {city} {postalCode}, {country}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--accent)">
                                                Delivery notes
                                            </p>
                                            <ul className="mt-2 list-inside list-disc text-(--muted)">
                                                <li>
                                                    Large truck: {largeTruckOk ? "Yes" : "Not confirmed"}
                                                </li>
                                                <li>
                                                    Unload help: {unloadHelpOk ? "Yes" : "Not confirmed"}
                                                </li>
                                                {floorNote.trim() ? (
                                                    <li>Notes: {floorNote.trim()}</li>
                                                ) : null}
                                            </ul>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--accent)">
                                                Payment
                                            </p>
                                            <p className="mt-2 text-foreground">
                                                {paymentMethod === "cash"
                                                    ? "Cash on delivery / meet-up"
                                                    : "Online payment"}
                                            </p>
                                            {paymentMethod === "online" && paymentReference.trim() ? (
                                                <p className="text-xs text-(--muted)">
                                                    Ref: {paymentReference.trim()}
                                                </p>
                                            ) : null}
                                        </div>
                                    </div>
                                    <div className="mt-10 flex justify-end">
                                        <Button
                                            type="button"
                                            disabled={submitting || !canPlaceOrder}
                                            onClick={() => void handlePlaceOrder()}
                                            className="h-12 min-w-[220px] bg-(--accent) text-xs font-bold uppercase tracking-[0.16em] text-[#030608] hover:brightness-110"
                                        >
                                            {submitting ? "Placing order…" : "Place order"}
                                        </Button>
                                    </div>
                                </section>
                            ) : null}
                        </div>

                        <aside className="lg:sticky lg:top-28 lg:self-start">
                            <div className="rounded-xl border border-white/10 bg-[#0c1018] p-6 shadow-[0_0_60px_-24px_rgba(34,199,243,0.35)]">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-(--accent)">
                                    Order summary
                                </p>
                                <h2 className="mt-2 text-lg font-bold tracking-tight">Your items</h2>
                                <div className="mt-6 space-y-4">
                                    {loadingCart ? (
                                        <p className="text-sm text-(--muted)">Loading cart…</p>
                                    ) : (
                                        cartItems.map((item) => {
                                            const p = productMap[item.productId];
                                            const thumb =
                                                p?.thumbnailUrl?.trim() ||
                                                p?.media[0]?.url ||
                                                null;
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
                                                        <p className="mt-1 text-xs text-(--muted)">
                                                            Qty {item.quantity}
                                                        </p>
                                                        {specLine ? (
                                                            <p className="mt-1 text-xs text-(--muted)">
                                                                {specLine}
                                                            </p>
                                                        ) : null}
                                                        <p className="mt-1 text-sm font-semibold text-(--accent)">
                                                            {formatPeso(line)}
                                                        </p>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                                <div className="mt-6 space-y-2 border-t border-white/10 pt-6 text-sm">
                                    <div className="flex justify-between text-(--muted)">
                                        <span>Subtotal</span>
                                        <span className="tabular-nums text-foreground">
                                            {formatPeso(subtotal)}
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-(--muted)">
                                        <span>Shipping & crating</span>
                                        <span className="text-foreground">Arranged with seller</span>
                                    </div>
                                    <div className="flex justify-between pt-2 text-base font-bold">
                                        <span>Total</span>
                                        <span className="tabular-nums text-(--accent)">
                                            {formatPeso(subtotal)}
                                        </span>
                                    </div>
                                    <p className="pt-2 text-xs italic text-(--muted)">
                                        Final total may include delivery fees the seller confirms with
                                        you.
                                    </p>
                                </div>
                                <div className="mt-6 border-l-2 border-(--accent)/80 bg-black/20 px-4 py-3">
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-(--accent)">
                                        {appName} trust
                                    </p>
                                    <p className="mt-1 text-xs leading-relaxed text-(--muted)">
                                        Orders are tied to your account. Pay and receive items only
                                        through agreed channels with verified sellers.
                                    </p>
                                </div>
                            </div>
                        </aside>
                    </div>
                )}
            </div>
        </main>
    );
}
