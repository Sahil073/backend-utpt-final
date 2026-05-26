import jwt from "jsonwebtoken";
import crypto from "crypto";
import { ENV } from "../config/env";

export interface AccessTokenPayload {
  id: string;
  role: "student" | "trainer" | "admin" | "setup";
  email: string;
  collegeId: string;
  jti: string;
}

// Generate a unique token ID (used for blacklisting on logout)
export const generateJti = (): string => crypto.randomUUID();

// ─── Access Token (15 min) ───────────────────────────────────
export const generateAccessToken = (
  payload: Omit<AccessTokenPayload, "jti">
): { token: string; jti: string } => {
  const jti = generateJti();
  const token = jwt.sign({ ...payload, jti }, ENV.JWT_SECRET, {
    expiresIn: "15m",
  });
  return { token, jti };
};

// ─── Setup Token (5 min, after OTP verify) ───────────────────
export const generateSetupToken = (
  userId: string,
  collegeId: string,
  email: string
): string => {
  const jti = generateJti();
  return jwt.sign(
    { id: userId, role: "setup", email, collegeId, jti },
    ENV.JWT_SECRET,
    { expiresIn: "5m" }
  );
};

// ─── Refresh Token (7 days) ──────────────────────────────────
export const generateRefreshToken = (): string => {
  return crypto.randomBytes(64).toString("hex");
};

// ─── Verify Access Token ─────────────────────────────────────
export const verifyAccessToken = (token: string): AccessTokenPayload => {
  return jwt.verify(token, ENV.JWT_SECRET) as AccessTokenPayload;
};