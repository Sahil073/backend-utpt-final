import cron from "node-cron";
import { supabase } from "../config/db";
import { syncUserCoding } from "../services/coding.service";
import { recomputeUserScore } from "../services/scoring.service";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const startSyncCodingJob = (): void => {
  // Every 2 hours at :30 — offset from GitHub sync so they don't overlap
  cron.schedule("30 */2 * * *", async () => {
    console.log("⏰ [CRON] Starting coding sync for all users...");

    try {
      const { data: users, error } = await supabase
        .from("users")
        .select("id, leetcode_username, codeforces_username")
        .eq("role",      "student")
        .eq("is_active", true)
        .eq("top_label", 1);

      if (error) {
        console.error("❌ Coding sync: failed to fetch users:", error.message);
        return;
      }

      if (!users || users.length === 0) {
        console.log("No active portal students found.");
        return;
      }

      console.log(`Syncing coding stats for ${users.length} users...`);
      let successCount = 0;
      let failCount    = 0;

      for (const user of users) {
        if (!user.leetcode_username && !user.codeforces_username) continue;
        try {
          await syncUserCoding(
            user.id,
            user.leetcode_username  ?? null,
            user.codeforces_username ?? null
          );
          // Recompute this student's score immediately after sync
          await recomputeUserScore(user.id);
          successCount++;
        } catch (err) {
          console.error(`Coding sync failed for user ${user.id}:`, err);
          failCount++;
        }
        // 250 ms stagger — respects Codeforces rate limits
        await sleep(250);
      }

      console.log(`✅ Coding sync cron complete: ${successCount} ok, ${failCount} failed`);
    } catch (err) {
      console.error("❌ Coding sync cron crashed:", err);
    }
  });

  console.log("✅ syncCoding cron registered (every 2 hours at :30)");
};