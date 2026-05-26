import rateLimit from "express-rate-limit";
import { Request } from "express";

// Skip rate limiting for admin users (identified by role in JWT payload)
const skipAdmin = (req: Request): boolean => {
  return req.user?.role === "admin";
};

// Global — 300 requests per 15 minutes; admin routes skip entirely
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  skip: skipAdmin,
  message: { success: false, data: null, message: "Too many requests, slow down" },
  standardHeaders: true,
  legacyHeaders: false,
});

// Auth routes — 10 requests per minute (covers page reloads + token refresh)
export const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { success: false, data: null, message: "Too many auth attempts, wait a minute" },
  standardHeaders: true,
  legacyHeaders: false,
});
