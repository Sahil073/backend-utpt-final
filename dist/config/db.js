"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectRedis = exports.redis = exports.connectMongoDB = exports.supabase = void 0;
// src/config/db.ts
const mongoose_1 = __importDefault(require("mongoose"));
const supabase_js_1 = require("@supabase/supabase-js");
const ioredis_1 = __importDefault(require("ioredis"));
const env_1 = require("./env");
// ─── Supabase ───────────────────────────────────────────────
exports.supabase = (0, supabase_js_1.createClient)(env_1.ENV.SUPABASE_URL, env_1.ENV.SUPABASE_SERVICE_KEY // use service key on backend (bypasses RLS)
);
// ─── MongoDB ────────────────────────────────────────────────
const connectMongoDB = async () => {
    try {
        await mongoose_1.default.connect(env_1.ENV.MONGODB_URI);
        console.log("✅ MongoDB connected");
    }
    catch (err) {
        console.error("❌ MongoDB connection failed:", err);
        process.exit(1);
    }
};
exports.connectMongoDB = connectMongoDB;
// ─── Redis ──────────────────────────────────────────────────
exports.redis = new ioredis_1.default(env_1.ENV.REDIS_URL, {
    tls: {}, // required for Upstash rediss:// URLs
    maxRetriesPerRequest: 3,
    lazyConnect: true,
});
const connectRedis = async () => {
    try {
        await exports.redis.connect();
        console.log("✅ Redis connected");
    }
    catch (err) {
        console.error("❌ Redis connection failed:", err);
        process.exit(1);
    }
};
exports.connectRedis = connectRedis;
