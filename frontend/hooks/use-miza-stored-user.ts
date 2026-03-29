"use client";

import { useCallback, useEffect, useState } from "react";
import type { AuthUser } from "@/types";

export function readMizaStoredUser(): AuthUser | null {
    if (typeof window === "undefined") {
        return null;
    }
    try {
        const raw = window.localStorage.getItem("miza_user");
        if (!raw) {
            return null;
        }
        const parsed = JSON.parse(raw) as unknown;
        if (
            parsed &&
            typeof parsed === "object" &&
            "id" in parsed &&
            "email" in parsed &&
            "role" in parsed
        ) {
            return parsed as AuthUser;
        }
        return null;
    } catch {
        return null;
    }
}

export function useMizaStoredUser(): { user: AuthUser | null; refresh: () => void } {
    const [user, setUser] = useState<AuthUser | null>(() => readMizaStoredUser());

    const refresh = useCallback(() => {
        setUser(readMizaStoredUser());
    }, []);

    useEffect(() => {
        function onStorage(e: StorageEvent) {
            if (e.key === "miza_user" || e.key === "miza_token") {
                refresh();
            }
        }
        function onAuthCustom() {
            refresh();
        }
        window.addEventListener("storage", onStorage);
        window.addEventListener("miza-auth-change", onAuthCustom);
        return () => {
            window.removeEventListener("storage", onStorage);
            window.removeEventListener("miza-auth-change", onAuthCustom);
        };
    }, [refresh]);

    return { user, refresh };
}
