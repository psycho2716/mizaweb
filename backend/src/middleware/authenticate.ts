import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { db } from "../lib/store";

declare global {
  namespace Express {
    interface Request {
      authUserId?: string;
    }
  }
}

export function authenticate(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const authorization = request.header("authorization");
  if (authorization?.startsWith("Bearer ")) {
    const token = authorization.replace("Bearer ", "").trim();
    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as { sub: string };
      if (payload.sub && db.users.has(payload.sub)) {
        request.authUserId = payload.sub;
        next();
        return;
      }
    } catch {
      response.status(401).json({ error: "Invalid token" });
      return;
    }
  }

  const authUserId = request.header("x-user-id");
  if (!authUserId || !db.users.has(authUserId)) {
    response.status(401).json({ error: "Unauthorized" });
    return;
  }

  request.authUserId = authUserId;
  next();
}
