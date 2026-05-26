import { Request, Response, NextFunction } from "express";
import { verifyAccessToken, AccessTokenPayload } from "../utils/jwt.utils";
import { redis } from "../config/db";

// Extend Express Request to carry the user payload
declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

// ─── Verify JWT ──────────────────────────────────────────────
export const verifyToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ success: false, data: null, message: "No token provided" });
      return;
    }

    const token = authHeader.split(" ")[1];
    const payload = verifyAccessToken(token);

    // Check if token is blacklisted (logged out)
    const blacklisted = await redis.get(`token:blacklist:${payload.jti}`);
    if (blacklisted) {
      res.status(401).json({ success: false, data: null, message: "Token has been revoked" });
      return;
    }

    req.user = payload;
    next();
  } catch {
    res.status(401).json({ success: false, data: null, message: "Invalid or expired token" });
  }
};

// ─── Require Role ────────────────────────────────────────────
export const requireRole = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ success: false, data: null, message: "Forbidden — insufficient role" });
      return;
    }
    next();
  };
};

// ─── Require Setup Token specifically ────────────────────────
export const requireSetupToken = requireRole("setup");