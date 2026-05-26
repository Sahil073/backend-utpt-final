import cron from "node-cron";
import { supabase } from "../config/db";
import { DailySolveLog } from "../models/DailySolveLog.model";
import { sendToUser } from "../services/notification.service";

export const startNudgeJob = (io: any): void => {
  // Every day at 8:00 AM
  cron.schedule("0 8 * * *", async () => {
    console.log("⏰ [CRON] Running poor performers nudge...");

    try {
      // Get all active students
      const { data: students } = await supabase
        .from("users")
        .select("id")
        .eq("role",      "student")
        .eq("is_active", true);

      if (!students) return;

      // Date 7 days ago
      const since = new Date();
      since.setDate(since.getDate() - 7);
      const sinceStr = since.toISOString().slice(0, 10);

      for (const student of students) {
        // Check if any solves in last 7 days
        const logs = await DailySolveLog.find({
          user_id:      student.id,
          date:         { $gte: sinceStr },
          total_solved: { $gt: 0 },
        }).lean();

        if (logs.length === 0) {
          // No solves in 7 days — send nudge
          await sendToUser(student.id, {
            title:      "⚠️ You haven't solved any problems this week!",
            body:       "Keep your streak alive. Solve at least one problem today on LeetCode or Codeforces.",
            notifType:  "reminder",
            sendEmail:  true,
            sendPush:   true,
            io,
          });
          console.log(`📨 Nudge sent to student ${student.id}`);
        }
      }

      console.log("✅ Poor performers nudge complete");
    } catch (err) {
      console.error("❌ Nudge job failed:", err);
    }
  });

  console.log("✅ nudgePoorPerformers cron registered (daily 8AM)");
};