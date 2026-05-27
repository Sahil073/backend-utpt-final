import cron from "node-cron";
import { supabase } from "../config/db";
import { syncUserGitHub } from "../services/github.service";
import { recomputeUserScore } from "../services/scoring.service";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const startSyncGitHubJob = (): void => {
  // Every 2 hours at :00
  cron.schedule("0 */2 * * *", async () => {
    console.log("⏰ [CRON] Starting GitHub sync for all users...");

    try {
      // Sync all portal students (top_label=1, is_active=true) with a GitHub username
      // Note: we check is_active so disabled/suspended accounts are skipped
      const { data: users, error } = await supabase
        .from("users")
        .select("id, github_username")
        .eq("role",      "student")
        .eq("is_active", true)
        .eq("top_label", 1)
        .not("github_username", "is", null);

      if (error) {
        console.error("❌ GitHub sync: failed to fetch users:", error.message);
        return;
      }

      if (!users || users.length === 0) {
        console.log("No active portal students with a GitHub username found.");
        return;
      }

      console.log(`Syncing GitHub for ${users.length} users...`);
      let successCount = 0;
      let failCount    = 0;

      for (const user of users) {
        try {
          await syncUserGitHub(user.id, user.github_username);
          // Recompute this student's score immediately after sync
          await recomputeUserScore(user.id);
          successCount++;
        } catch (err) {
          console.error(`GitHub sync failed for ${user.github_username}:`, err);
          failCount++;
        }
        // 200 ms stagger — stays well within GitHub's 5 000 req/hr limit
        await sleep(200);
      }

      console.log(`✅ GitHub sync cron complete: ${successCount} ok, ${failCount} failed`);
    } catch (err) {
      console.error("❌ GitHub sync cron crashed:", err);
    }
  });

  console.log("✅ syncGitHub cron registered (every 2 hours at :00)");
};