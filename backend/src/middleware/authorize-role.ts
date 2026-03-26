import type { NextFunction, Request, Response } from "express";
import { db } from "../lib/store";
import type { UserRole } from "../types/domain";

export function authorizeRole(allowedRoles: UserRole[]) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const userId = request.authUserId;
    const user = userId ? db.users.get(userId) : undefined;

    if (!user || !allowedRoles.includes(user.role)) {
      response.status(403).json({ error: "Forbidden" });
      return;
    }

    next();
  };
}
