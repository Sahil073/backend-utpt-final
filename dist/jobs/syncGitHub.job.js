"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startSyncGitHubJob = void 0;
const node_cron_1 = __importDefault(require("node-cron"));
const db_1 = require("../config/db");
const github_service_1 = require("../services/github.service");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const startSyncGitHubJob = () => {
    node_cron_1.default.schedule("0 */2 * * *", async () => {
        console.log("⏰ [CRON] Starting GitHub sync for all users...");
        try {
            const { data: users } = await db_1.supabase
                .from("users")
                .select("id, github_username")
                .eq("role", "student")
                .eq("is_active", true)
                .not("github_username", "is", null);
            if (!users || users.length === 0) {
                console.log("No users with GitHub username found");
                return;
            }
            console.log(`Syncing GitHub for ${users.length} users...`);
            for (const user of users) {
                try {
                    await (0, github_service_1.syncUserGitHub)(user.id, user.github_username);
                }
                catch (err) {
                    console.error(`GitHub sync failed for ${user.github_username}:`, err);
                }
                await sleep(200); // 200ms stagger — stays well within 5000 req/hr
            }
            console.log("✅ GitHub sync cron complete");
        }
        catch (err) {
            console.error("❌ GitHub sync cron failed:", err);
        }
    });
    console.log("✅ syncGitHub cron registered (every 2 hours)");
};
exports.startSyncGitHubJob = startSyncGitHubJob;
