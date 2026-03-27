import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { AppChrome } from "@/components/app-chrome";
import { getAppName } from "@/lib/utils";
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
    title: getAppName(),
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
            <body className="public-shell min-h-full text-foreground" suppressHydrationWarning>
                <AppChrome>{children}</AppChrome>
                <Toaster richColors />
            </body>
        </html>
    );
}
