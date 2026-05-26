"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startSyncCodingJob = void 0;
const node_cron_1 = __importDefault(require("node-cron"));
const db_1 = require("../config/db");
const coding_service_1 = require("../services/coding.service");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const startSyncCodingJob = () => {
    node_cron_1.default.schedule("30 */2 * * *", async () => {
        // Runs 30 min after GitHub sync (offset so they don't overlap)
        console.log("⏰ [CRON] Starting coding sync for all users...");
        try {
            const { data: users } = await db_1.supabase
                .from("users")
                .select("id, leetcode_username, codeforces_username")
                .eq("role", "student")
                .eq("is_active", true);
            if (!users || users.length === 0) {
                console.log("No active students found");
                return;
            }
            console.log(`Syncing coding stats for ${users.length} users...`);
            for (const user of users) {
                if (!user.leetcode_username && !user.codeforces_username)
                    continue;
                try {
                    await (0, coding_service_1.syncUserCoding)(user.id, user.leetcode_username, user.codeforces_username);
                }
                catch (err) {
                    console.error(`Coding sync failed for user ${user.id}:`, err);
                }
                await sleep(250); // 250ms stagger for Codeforces rate limit
            }
            console.log("✅ Coding sync cron complete");
        }
        catch (err) {
            console.error("❌ Coding sync cron failed:", err);
        }
    });
    console.log("✅ syncCoding cron registered (every 2 hours, offset 30min)");
};
exports.startSyncCodingJob = startSyncCodingJob;
