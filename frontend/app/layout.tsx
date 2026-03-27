import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Toaster } from "sonner";
import "./globals.css";

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"]
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"]
});

export const metadata: Metadata = {
    title: "Romblon Stone Marketplace",
    description: "AI-powered stone e-commerce platform"
};

export default function RootLayout({
    children
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html
            lang="en"
            className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
        >
            <body className="min-h-full bg-zinc-50 text-zinc-900" suppressHydrationWarning>
                <header className="border-b bg-white/95">
                    <nav className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
                        <Link href="/" className="font-semibold">
                            Romblon Stone Marketplace
                        </Link>
                        <div className="flex items-center gap-4 text-sm">
                            <Link href="/products">Products</Link>
                            <Link href="/cart">Cart</Link>
                            <Link href="/seller/listings">Seller</Link>
                            <Link href="/seller/orders">Seller Orders</Link>
                            <Link href="/admin/verifications">Admin</Link>
                            <Link href="/auth/login">Login</Link>
                            <Link href="/auth/register">Register</Link>
                        </div>
                    </nav>
                </header>
                {children}
                <Toaster richColors />
            </body>
        </html>
    );
}
