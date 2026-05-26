"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logout = exports.refreshToken = exports.login = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const db_1 = require("../config/db");
const db_2 = require("../config/db");
const jwt_utils_1 = require("../utils/jwt.utils");
const setRefreshCookie = (res, token) => {
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
const login = async (req, res) => {
    try {
        const { collegeId, password } = req.body;
        if (!collegeId || !password) {
            res.status(400).json({ success: false, data: null, message: "collegeId and password are required" });
            return;
        }
        const { data: user, error } = await db_1.supabase
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
        const isValid = await bcryptjs_1.default.compare(password, user.password_hash);
        if (!isValid) {
            res.status(401).json({ success: false, data: null, message: "Invalid credentials" });
            return;
        }
        const { token: accessToken } = (0, jwt_utils_1.generateAccessToken)({
            id: user.id,
            role: user.role,
            email: user.email,
            collegeId: user.college_id,
        });
        const refreshToken = (0, jwt_utils_1.generateRefreshToken)();
        const refreshHash = await bcryptjs_1.default.hash(refreshToken, 10);
        await db_1.supabase.from("refresh_tokens").insert({
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
    }
    catch (err) {
        console.error("login error:", err);
        res.status(500).json({ success: false, data: null, message: "Internal server error" });
    }
};
exports.login = login;
// ────────────────────────────────────────────────────────────
// POST /auth/refresh
// ────────────────────────────────────────────────────────────
const refreshToken = async (req, res) => {
    try {
        const token = req.cookies?.refreshToken;
        if (!token) {
            res.status(401).json({ success: false, data: null, message: "No refresh token" });
            return;
        }
        const { data: tokens, error } = await db_1.supabase
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
            const isMatch = await bcryptjs_1.default.compare(token, t.token_hash);
            if (isMatch) {
                matchedToken = t;
                break;
            }
        }
        if (!matchedToken) {
            res.status(401).json({ success: false, data: null, message: "Invalid refresh token" });
            return;
        }
        const { data: user } = await db_1.supabase
            .from("users")
            .select("id, name, email, college_id, role, is_active")
            .eq("id", matchedToken.user_id)
            .single();
        if (!user || !user.is_active) {
            res.status(401).json({ success: false, data: null, message: "User not found or disabled" });
            return;
        }
        await db_1.supabase.from("refresh_tokens").delete().eq("id", matchedToken.id);
        const newRefreshToken = (0, jwt_utils_1.generateRefreshToken)();
        const newRefreshHash = await bcryptjs_1.default.hash(newRefreshToken, 10);
        await db_1.supabase.from("refresh_tokens").insert({
            user_id: user.id,
            token_hash: newRefreshHash,
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        });
        const { token: accessToken } = (0, jwt_utils_1.generateAccessToken)({
            id: user.id,
            role: user.role,
            email: user.email,
            collegeId: user.college_id,
        });
        setRefreshCookie(res, newRefreshToken);
        void Promise.resolve(db_1.supabase
            .from("refresh_tokens")
            .delete()
            .lt("expires_at", new Date().toISOString())).catch(() => { });
        res.status(200).json({
            success: true,
            data: { accessToken },
            message: "Token refreshed",
        });
    }
    catch (err) {
        console.error("refreshToken error:", err);
        res.status(500).json({ success: false, data: null, message: "Internal server error" });
    }
};
exports.refreshToken = refreshToken;
// ────────────────────────────────────────────────────────────
// POST /auth/logout
// ────────────────────────────────────────────────────────────
const logout = async (req, res) => {
    try {
        const jti = req.user.jti;
        await db_2.redis.set(`token:blacklist:${jti}`, "1", "EX", 15 * 60);
        const refreshToken = req.cookies?.refreshToken;
        if (refreshToken) {
            const { data: tokens } = await db_1.supabase
                .from("refresh_tokens")
                .select("id, token_hash")
                .eq("user_id", req.user.id);
            if (tokens) {
                for (const t of tokens) {
                    const isMatch = await bcryptjs_1.default.compare(refreshToken, t.token_hash);
                    if (isMatch) {
                        await db_1.supabase.from("refresh_tokens").delete().eq("id", t.id);
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
    }
    catch (err) {
        console.error("logout error:", err);
        res.status(500).json({ success: false, data: null, message: "Internal server error" });
    }
};
exports.logout = logout;
