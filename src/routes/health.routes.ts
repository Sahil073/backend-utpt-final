import { Router } from "express";
import mongoose from "mongoose";
import { redis } from "../config/db";
import { supabase } from "../config/db";

const router = Router();

router.get("/", async (_req, res) => {
  // Check all services
  const mongoStatus = mongoose.connection.readyState === 1 ? "ok" : "down";

  let redisStatus = "ok";
  try {
    await redis.ping();
  } catch {
    redisStatus = "down";
  }

  let supabaseStatus = "ok";
  try {
    const { error } = await supabase.from("users").select("id").limit(1);
    if (error) supabaseStatus = "down";
  } catch {
    supabaseStatus = "down";
  }

  const allOk = mongoStatus === "ok" && redisStatus === "ok" && supabaseStatus === "ok";

  res.status(allOk ? 200 : 503).json({
    status:    allOk ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    services: {
      mongodb:   mongoStatus,
      redis:     redisStatus,
      supabase:  supabaseStatus,
    },
  });
});

export default router;