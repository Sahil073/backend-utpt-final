"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyAccessToken = exports.generateRefreshToken = exports.generateSetupToken = exports.generateAccessToken = exports.generateJti = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = __importDefault(require("crypto"));
const env_1 = require("../config/env");
// Generate a unique token ID (used for blacklisting on logout)
const generateJti = () => crypto_1.default.randomUUID();
exports.generateJti = generateJti;
// ─── Access Token (15 min) ───────────────────────────────────
const generateAccessToken = (payload) => {
    const jti = (0, exports.generateJti)();
    const token = jsonwebtoken_1.default.sign({ ...payload, jti }, env_1.ENV.JWT_SECRET, {
        expiresIn: "15m",
    });
    return { token, jti };
};
exports.generateAccessToken = generateAccessToken;
// ─── Setup Token (5 min, after OTP verify) ───────────────────
const generateSetupToken = (userId, collegeId, email) => {
    const jti = (0, exports.generateJti)();
    return jsonwebtoken_1.default.sign({ id: userId, role: "setup", email, collegeId, jti }, env_1.ENV.JWT_SECRET, { expiresIn: "5m" });
};
exports.generateSetupToken = generateSetupToken;
// ─── Refresh Token (7 days) ──────────────────────────────────
const generateRefreshToken = () => {
    return crypto_1.default.randomBytes(64).toString("hex");
};
exports.generateRefreshToken = generateRefreshToken;
// ─── Verify Access Token ─────────────────────────────────────
const verifyAccessToken = (token) => {
    return jsonwebtoken_1.default.verify(token, env_1.ENV.JWT_SECRET);
};
exports.verifyAccessToken = verifyAccessToken;
