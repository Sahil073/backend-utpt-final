import cron from "node-cron";
import { recomputeAllScores } from "../services/scoring.service";

// Every 2 hours
export const startComputeScoresJob = () => {
  cron.schedule("0 */2 * * *", async () => {
    console.log("⏰ [CRON] Computing scores...");
    try {
      await recomputeAllScores();
    } catch (err) {
      console.error("❌ Score compute job failed:", err);
    }
  });
  console.log("✅ computeScores cron registered (every 2 hours)");
};