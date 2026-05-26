import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { supabase } from "../config/db";
import { redis } from "../config/db";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
} from "../utils/jwt.utils";

const setRefreshCookie = (res: Response, token: string) => {
  res.cookie("refreshToken", token, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};

// ────────────────────────────────────────────────────────────
// POST /auth/login
// Body: { collegeId, password }
// Initial password = father_number (set at import)
// Returns force_password_change flag if first login
// ────────────────────────────────────────────────────────────
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { collegeId, password } = req.body;

    if (!collegeId || !password) {
      res.status(400).json({ success: false, data: null, message: "collegeId and password are required" });
      return;
    }

    const { data: user, error } = await supabase
      .from("users")
      .select("id, name, email, college_id, role, password_hash, is_active, is_verified, force_password_change, top_label")
      .eq("college_id", collegeId)
      .single();

    if (error || !user) {
      res.status(401).json({ success: false, data: null, message: "Invalid credentials" });
      return;
    }

    if (!user.is_active) {
      res.status(403).json({ success: false, data: null, message: "Account is disabled. Contact admin." });
      return;
    }

    if (!user.is_verified || !user.password_hash) {
      res.status(403).json({ success: false, data: null, message: "Account not activated. Contact your admin." });
      return;
    }

    if (user.role === "student" && user.top_label !== 1) {
      res.status(403).json({ success: false, data: null, message: "This account does not have portal access. Contact your admin." });
      return;
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      res.status(401).json({ success: false, data: null, message: "Invalid credentials" });
      return;
    }

    const { token: accessToken } = generateAccessToken({
      id: user.id,
      role: user.role as "student" | "trainer" | "admin",
      email: user.email,
      collegeId: user.college_id,
    });

    const refreshToken = generateRefreshToken();
    const refreshHash = await bcrypt.hash(refreshToken, 10);

    await supabase.from("refresh_tokens").insert({
      user_id: user.id,
      token_hash: refreshHash,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });

    setRefreshCookie(res, refreshToken);

    res.status(200).json({
      success: true,
      data: {
        accessToken,
        user: {
          id: user.id,
          name: user.name,
          role: user.role,
          email: user.email,
          college_id: user.college_id,
        },
        force_password_change: !!user.force_password_change,
      },
      message: user.force_password_change ? "Login successful. Please change your password." : "Login successful",
    });
  } catch (err) {
    console.error("login error:", err);
    res.status(500).json({ success: false, data: null, message: "Internal server error" });
  }
};

// ────────────────────────────────────────────────────────────
// POST /auth/refresh
// ────────────────────────────────────────────────────────────
export const refreshToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.cookies?.refreshToken;

    if (!token) {
      res.status(401).json({ success: false, data: null, message: "No refresh token" });
      return;
    }

    const { data: tokens, error } = await supabase
      .from("refresh_tokens")
      .select("id, user_id, token_hash, expires_at")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(50);

    if (error || !tokens || tokens.length === 0) {
      res.status(401).json({ success: false, data: null, message: "Invalid refresh token" });
      return;
    }

    let matchedToken = null;
    for (const t of tokens) {
      const isMatch = await bcrypt.compare(token, t.token_hash);
      if (isMatch) { matchedToken = t; break; }
    }

    if (!matchedToken) {
      res.status(401).json({ success: false, data: null, message: "Invalid refresh token" });
      return;
    }

    const { data: user } = await supabase
      .from("users")
      .select("id, name, email, college_id, role, is_active")
      .eq("id", matchedToken.user_id)
      .single();

    if (!user || !user.is_active) {
      res.status(401).json({ success: false, data: null, message: "User not found or disabled" });
      return;
    }

    await supabase.from("refresh_tokens").delete().eq("id", matchedToken.id);

    const newRefreshToken = generateRefreshToken();
    const newRefreshHash = await bcrypt.hash(newRefreshToken, 10);

    await supabase.from("refresh_tokens").insert({
      user_id: user.id,
      token_hash: newRefreshHash,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });

    const { token: accessToken } = generateAccessToken({
      id: user.id,
      role: user.role as "student" | "trainer" | "admin",
      email: user.email,
      collegeId: user.college_id,
    });

    setRefreshCookie(res, newRefreshToken);

    void Promise.resolve(
      supabase
        .from("refresh_tokens")
        .delete()
        .lt("expires_at", new Date().toISOString())
    ).catch(() => {});

    res.status(200).json({
      success: true,
      data: { accessToken },
      message: "Token refreshed",
    });
  } catch (err) {
    console.error("refreshToken error:", err);
    res.status(500).json({ success: false, data: null, message: "Internal server error" });
  }
};

// ────────────────────────────────────────────────────────────
// POST /auth/logout
// ────────────────────────────────────────────────────────────
export const logout = async (req: Request, res: Response): Promise<void> => {
  try {
    const jti = req.user!.jti;

    await redis.set(`token:blacklist:${jti}`, "1", "EX", 15 * 60);

    const refreshToken = req.cookies?.refreshToken;
    if (refreshToken) {
      const { data: tokens } = await supabase
        .from("refresh_tokens")
        .select("id, token_hash")
        .eq("user_id", req.user!.id);

      if (tokens) {
        for (const t of tokens) {
          const isMatch = await bcrypt.compare(refreshToken, t.token_hash);
          if (isMatch) {
            await supabase.from("refresh_tokens").delete().eq("id", t.id);
            break;
          }
        }
      }
    }

    res.clearCookie("refreshToken");

    res.status(200).json({
      success: true,
      data: null,
      message: "Logged out successfully",
    });
  } catch (err) {
    console.error("logout error:", err);
    res.status(500).json({ success: false, data: null, message: "Internal server error" });
  }
};
