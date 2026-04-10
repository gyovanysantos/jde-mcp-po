import type { Request, Response, NextFunction } from "express";
import { getSession } from "../routes/auth.js";

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const session = getSession(auth.slice(7));
  if (!session) {
    res.status(401).json({ error: "Session expired" });
    return;
  }
  // Attach session info for downstream routes
  (req as unknown as Record<string, unknown>).userSession = session;
  next();
}
