"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authLimiter = exports.globalLimiter = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
// Skip rate limiting for admin users (identified by role in JWT payload)
const skipAdmin = (req) => {
    return req.user?.role === "admin";
};
// Global — 300 requests per 15 minutes; admin routes skip entirely
exports.globalLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 300,
    skip: skipAdmin,
    message: { success: false, data: null, message: "Too many requests, slow down" },
    standardHeaders: true,
    legacyHeaders: false,
});
// Auth routes — 10 requests per minute (covers page reloads + token refresh)
exports.authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    max: 10,
    message: { success: false, data: null, message: "Too many auth attempts, wait a minute" },
    standardHeaders: true,
    legacyHeaders: false,
});
