// src/config/db.ts
import mongoose from "mongoose";
import { createClient } from "@supabase/supabase-js";
import Redis from "ioredis";
import { ENV } from "./env";
// ─── Supabase ───────────────────────────────────────────────
export const supabase = createClient(
  ENV.SUPABASE_URL,
  ENV.SUPABASE_SERVICE_KEY  // use service key on backend (bypasses RLS)
);

// ─── MongoDB ────────────────────────────────────────────────
export const connectMongoDB = async (): Promise<void> => {
  try {
    await mongoose.connect(ENV.MONGODB_URI);
    console.log("✅ MongoDB connected");
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err);
    process.exit(1);
  }
};

// ─── Redis ──────────────────────────────────────────────────
export const redis = new Redis(ENV.REDIS_URL, {
  tls: {}, // required for Upstash rediss:// URLs
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

export const connectRedis = async (): Promise<void> => {
  try {
    await redis.connect();
    console.log("✅ Redis connected");
  } catch (err) {
    console.error("❌ Redis connection failed:", err);
    process.exit(1);
  }
};