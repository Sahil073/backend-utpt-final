"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startNudgeJob = void 0;
const node_cron_1 = __importDefault(require("node-cron"));
const db_1 = require("../config/db");
const DailySolveLog_model_1 = require("../models/DailySolveLog.model");
const notification_service_1 = require("../services/notification.service");
const startNudgeJob = (io) => {
    // Every day at 8:00 AM
    node_cron_1.default.schedule("0 8 * * *", async () => {
        console.log("⏰ [CRON] Running poor performers nudge...");
        try {
            // Get all active students
            const { data: students } = await db_1.supabase
                .from("users")
                .select("id")
                .eq("role", "student")
                .eq("is_active", true);
            if (!students)
                return;
            // Date 7 days ago
            const since = new Date();
            since.setDate(since.getDate() - 7);
            const sinceStr = since.toISOString().slice(0, 10);
            for (const student of students) {
                // Check if any solves in last 7 days
                const logs = await DailySolveLog_model_1.DailySolveLog.find({
                    user_id: student.id,
                    date: { $gte: sinceStr },
                    total_solved: { $gt: 0 },
                }).lean();
                if (logs.length === 0) {
                    // No solves in 7 days — send nudge
                    await (0, notification_service_1.sendToUser)(student.id, {
                        title: "⚠️ You haven't solved any problems this week!",
                        body: "Keep your streak alive. Solve at least one problem today on LeetCode or Codeforces.",
                        notifType: "reminder",
                        sendEmail: true,
                        sendPush: true,
                        io,
                    });
                    console.log(`📨 Nudge sent to student ${student.id}`);
                }
            }
            console.log("✅ Poor performers nudge complete");
        }
        catch (err) {
            console.error("❌ Nudge job failed:", err);
        }
    });
    console.log("✅ nudgePoorPerformers cron registered (daily 8AM)");
};
exports.startNudgeJob = startNudgeJob;
