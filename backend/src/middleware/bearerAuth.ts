import type { Request, Response, NextFunction } from "express";

import { createAuthedSupabaseClient } from "../lib/supabase";
import type { AppUserRole } from "../types/express";

function parseBearer(header: string | undefined): string | null {
  if (!header || !header.startsWith("Bearer ")) return null;
  const t = header.slice(7).trim();
  return t.length > 0 ? t : null;
}

export async function requireBearerUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = parseBearer(req.headers.authorization);
  if (!token) {
    res.status(401).json({ error: "Missing or invalid Authorization header." });
    return;
  }

  const supabase = createAuthedSupabaseClient(token);
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    res.status(401).json({ error: "Invalid or expired session." });
    return;
  }

  req.bearerToken = token;
  req.userId = data.user.id;
  req.supabaseUser = supabase;
  next();
}

export async function loadProfileRole(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.supabaseUser || !req.userId) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const { data, error } = await req.supabaseUser.from("profiles").select("role").eq("id", req.userId).maybeSingle();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const role = data?.role;
  if (role !== "admin" && role !== "seller" && role !== "customer") {
    res.status(403).json({ error: "Profile role is not set." });
    return;
  }

  req.userRole = role as AppUserRole;
  next();
}

export function requireRole(...allowed: AppUserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.userRole || !allowed.includes(req.userRole)) {
      res.status(403).json({ error: "Insufficient permissions." });
      return;
    }
    next();
  };
}

/** Optional auth: sets user when Bearer present; continues either way. */
export async function optionalBearerUser(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = parseBearer(req.headers.authorization);
  if (!token) {
    next();
    return;
  }

  const supabase = createAuthedSupabaseClient(token);
  const { data, error } = await supabase.auth.getUser();
  if (!error && data.user) {
    req.bearerToken = token;
    req.userId = data.user.id;
    req.supabaseUser = supabase;
    const { data: prof } = await supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
    const role = prof?.role;
    if (role === "admin" || role === "seller" || role === "customer") {
      req.userRole = role;
    }
  }
  next();
}
