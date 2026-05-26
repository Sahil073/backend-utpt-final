"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireSetupToken = exports.requireRole = exports.verifyToken = void 0;
const jwt_utils_1 = require("../utils/jwt.utils");
const db_1 = require("../config/db");
// ─── Verify JWT ──────────────────────────────────────────────
const verifyToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            res.status(401).json({ success: false, data: null, message: "No token provided" });
            return;
        }
        const token = authHeader.split(" ")[1];
        const payload = (0, jwt_utils_1.verifyAccessToken)(token);
        // Check if token is blacklisted (logged out)
        const blacklisted = await db_1.redis.get(`token:blacklist:${payload.jti}`);
        if (blacklisted) {
            res.status(401).json({ success: false, data: null, message: "Token has been revoked" });
            return;
        }
        req.user = payload;
        next();
    }
    catch {
        res.status(401).json({ success: false, data: null, message: "Invalid or expired token" });
    }
};
exports.verifyToken = verifyToken;
// ─── Require Role ────────────────────────────────────────────
const requireRole = (...roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            res.status(403).json({ success: false, data: null, message: "Forbidden — insufficient role" });
            return;
        }
        next();
    };
};
exports.requireRole = requireRole;
// ─── Require Setup Token specifically ────────────────────────
exports.requireSetupToken = (0, exports.requireRole)("setup");
