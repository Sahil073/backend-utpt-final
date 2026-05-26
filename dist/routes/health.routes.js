"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const mongoose_1 = __importDefault(require("mongoose"));
const db_1 = require("../config/db");
const db_2 = require("../config/db");
const router = (0, express_1.Router)();
router.get("/", async (_req, res) => {
    // Check all services
    const mongoStatus = mongoose_1.default.connection.readyState === 1 ? "ok" : "down";
    let redisStatus = "ok";
    try {
        await db_1.redis.ping();
    }
    catch {
        redisStatus = "down";
    }
    let supabaseStatus = "ok";
    try {
        const { error } = await db_2.supabase.from("users").select("id").limit(1);
        if (error)
            supabaseStatus = "down";
    }
    catch {
        supabaseStatus = "down";
    }
    const allOk = mongoStatus === "ok" && redisStatus === "ok" && supabaseStatus === "ok";
    res.status(allOk ? 200 : 503).json({
        status: allOk ? "ok" : "degraded",
        timestamp: new Date().toISOString(),
        services: {
            mongodb: mongoStatus,
            redis: redisStatus,
            supabase: supabaseStatus,
        },
    });
});
exports.default = router;
