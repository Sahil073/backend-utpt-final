import cron from "node-cron";
import { supabase } from "../config/db";
import { syncUserCoding } from "../services/coding.service";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const startSyncCodingJob = (): void => {
  cron.schedule("30 */2 * * *", async () => {
    // Runs 30 min after GitHub sync (offset so they don't overlap)
    console.log("⏰ [CRON] Starting coding sync for all users...");

    try {
      const { data: users } = await supabase
        .from("users")
        .select("id, leetcode_username, codeforces_username")
        .eq("role",      "student")
        .eq("is_active", true);

      if (!users || users.length === 0) {
        console.log("No active students found");
        return;
      }

      console.log(`Syncing coding stats for ${users.length} users...`);

      for (const user of users) {
        if (!user.leetcode_username && !user.codeforces_username) continue;
        try {
          await syncUserCoding(
            user.id,
            user.leetcode_username,
            user.codeforces_username
          );
        } catch (err) {
          console.error(`Coding sync failed for user ${user.id}:`, err);
        }
        await sleep(250); // 250ms stagger for Codeforces rate limit
      }

      console.log("✅ Coding sync cron complete");
    } catch (err) {
      console.error("❌ Coding sync cron failed:", err);
    }
  });

  console.log("✅ syncCoding cron registered (every 2 hours, offset 30min)");
};