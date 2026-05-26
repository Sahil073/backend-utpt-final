import cron from "node-cron";
import { supabase } from "../config/db";
import { syncUserGitHub } from "../services/github.service";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const startSyncGitHubJob = (): void => {
  cron.schedule("0 */2 * * *", async () => {
    console.log("⏰ [CRON] Starting GitHub sync for all users...");

    try {
      const { data: users } = await supabase
        .from("users")
        .select("id, github_username")
        .eq("role",      "student")
        .eq("is_active", true)
        .not("github_username", "is", null);

      if (!users || users.length === 0) {
        console.log("No users with GitHub username found");
        return;
      }

      console.log(`Syncing GitHub for ${users.length} users...`);

      for (const user of users) {
        try {
          await syncUserGitHub(user.id, user.github_username);
        } catch (err) {
          console.error(`GitHub sync failed for ${user.github_username}:`, err);
        }
        await sleep(200); // 200ms stagger — stays well within 5000 req/hr
      }

      console.log("✅ GitHub sync cron complete");
    } catch (err) {
      console.error("❌ GitHub sync cron failed:", err);
    }
  });

  console.log("✅ syncGitHub cron registered (every 2 hours)");
};