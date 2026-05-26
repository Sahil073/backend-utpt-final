"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startComputeScoresJob = void 0;
const node_cron_1 = __importDefault(require("node-cron"));
const scoring_service_1 = require("../services/scoring.service");
// Every 2 hours
const startComputeScoresJob = () => {
    node_cron_1.default.schedule("0 */2 * * *", async () => {
        console.log("⏰ [CRON] Computing scores...");
        try {
            await (0, scoring_service_1.recomputeAllScores)();
        }
        catch (err) {
            console.error("❌ Score compute job failed:", err);
        }
    });
    console.log("✅ computeScores cron registered (every 2 hours)");
};
exports.startComputeScoresJob = startComputeScoresJob;
