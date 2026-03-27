import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import {
    createSupabaseAdminClient,
    isSupabaseAuthReady
} from "../integrations/supabase/client";
import {
    applyAuthUserToRuntime,
    syncFromSupabaseIfStale
} from "../integrations/supabase/persistence";
import { db } from "../lib/store";

declare global {
    namespace Express {
        interface Request {
            authUserId?: string;
        }
    }
}

export async function authenticate(
    request: Request,
    response: Response,
    next: NextFunction
): Promise<void> {
    try {
        if (env.NODE_ENV === "test") {
            const authUserId = request.header("x-user-id");
            if (authUserId && db.users.has(authUserId)) {
                request.authUserId = authUserId;
                next();
                return;
            }
        }

        const authorization = request.header("authorization");
        if (!authorization?.startsWith("Bearer ")) {
            response.status(401).json({ error: "Unauthorized" });
            return;
        }
        const token = authorization.replace("Bearer ", "").trim();

        if (isSupabaseAuthReady()) {
            const supabase = createSupabaseAdminClient();
            if (!supabase) {
                response.status(401).json({ error: "Unauthorized" });
                return;
            }
            const {
                data: { user: authUser },
                error
            } = await supabase.auth.getUser(token);
            if (error || !authUser) {
                response.status(401).json({ error: "Invalid token" });
                return;
            }
            const uid = authUser.id;
            if (!db.users.has(uid)) {
                await syncFromSupabaseIfStale();
            }
            if (!db.users.has(uid)) {
                applyAuthUserToRuntime(authUser);
            }
            if (!db.users.has(uid)) {
                response.status(401).json({ error: "User profile not found" });
                return;
            }
            request.authUserId = uid;
            next();
            return;
        }

        try {
            const payload = jwt.verify(token, env.JWT_SECRET) as { sub?: string };
            if (payload.sub && db.users.has(payload.sub)) {
                request.authUserId = payload.sub;
                next();
                return;
            }
        } catch {
            response.status(401).json({ error: "Invalid token" });
            return;
        }

        response.status(401).json({ error: "Unauthorized" });
    } catch (error) {
        next(error);
    }
}

/**
 * Resolves the authenticated user id from Bearer token when present (optional cart routes).
 */
export async function resolveOptionalAuthUserId(request: Request): Promise<string | null> {
    try {
        const authorization = request.header("authorization");
        if (!authorization?.startsWith("Bearer ")) {
            return null;
        }
        const token = authorization.replace("Bearer ", "").trim();

        if (isSupabaseAuthReady()) {
            const supabase = createSupabaseAdminClient();
            if (!supabase) {
                return null;
            }
            const {
                data: { user: authUser },
                error
            } = await supabase.auth.getUser(token);
            if (error || !authUser) {
                return null;
            }
            if (!db.users.has(authUser.id)) {
                await syncFromSupabaseIfStale();
            }
            if (!db.users.has(authUser.id)) {
                applyAuthUserToRuntime(authUser);
            }
            return db.users.has(authUser.id) ? authUser.id : null;
        }

        try {
            const payload = jwt.verify(token, env.JWT_SECRET) as { sub?: string };
            if (payload.sub && db.users.has(payload.sub)) {
                return payload.sub;
            }
        } catch {
            return null;
        }
        return null;
    } catch {
        return null;
    }
}
