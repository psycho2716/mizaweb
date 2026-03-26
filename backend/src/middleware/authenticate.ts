import type { NextFunction, Request, Response } from "express";
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
  const authUserId = request.header("x-user-id");
  if (!authUserId || !db.users.has(authUserId)) {
    response.status(401).json({ error: "Unauthorized" });
    return;
  }

  request.authUserId = authUserId;
  next();
}
