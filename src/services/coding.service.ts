import { supabase } from "../config/db";
import { DailySolveLog } from "../models/DailySolveLog.model";
import { fetchLeetCodeStats } from "./leetcode.service";
import { fetchCodeforcesStats } from "./codeforces.service";

// ─── Sleep helper for rate limiting ─────────────────────────
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── Streak calculation ──────────────────────────────────────
// Each DailySolveLog document stores CUMULATIVE totals for that day's sync.
// To detect actual activity on a given day we compare consecutive days:
// if day[i].total > day[i+1].total the student solved something that day.
// For the most recent day we compare against the previous day's total.
const computeStreak = async (
  userId: string
): Promise<{ current: number; longest: number }> => {
  // Fetch last 100 daily logs, newest first
  const logs = await DailySolveLog.find({ user_id: userId })
    .sort({ date: -1 })
    .limit(101)
    .lean();

  if (logs.length === 0) return { current: 0, longest: 0 };

  // Build a map of date → total_solved (cumulative snapshot)
  // Then derive daily deltas: delta[i] = logs[i].total - logs[i+1].total
  // If delta > 0 the student was active that day.
  let current = 0;
  let longest = 0;
  let streak  = 0;
  const today = new Date();

  for (let i = 0; i < logs.length - 1; i++) {
    const logDate  = new Date(logs[i].date);
    const expected = new Date(today);
    expected.setDate(today.getDate() - i);

    const sameDay =
      logDate.toISOString().slice(0, 10) ===
      expected.toISOString().slice(0, 10);

    if (!sameDay) {
      // Gap in dates — streak is broken
      if (i === 0) current = 0;
      break;
    }

    // Compare with the previous day's snapshot to get today's delta
    const prevTotal = logs[i + 1]?.total_solved ?? 0;
    const delta     = logs[i].total_solved - prevTotal;

    if (delta > 0) {
      streak++;
      if (i === 0) current = streak;
      if (streak > longest) longest = streak;
    } else {
      // No new solves this day — streak resets
      if (i === 0) current = 0;
      break;
    }
  }

  // Edge case: only one log entry — consider it active if total > 0
  if (logs.length === 1 && logs[0].total_solved > 0) {
    const logDate  = new Date(logs[0].date);
    const expected = new Date(today);
    if (logDate.toISOString().slice(0, 10) === expected.toISOString().slice(0, 10)) {
      current = 1;
      longest = Math.max(1, longest);
    }
  }

  return { current, longest };
};

// ─── Main sync function ──────────────────────────────────────
export const syncUserCoding = async (
  userId:             string,
  leetcodeUsername?:  string | null,
  codeforcesHandle?:  string | null
): Promise<void> => {
  console.log(`🔄 Syncing coding stats for user ${userId}`);

  let lcStats = null;
  let cfStats = null;

  if (leetcodeUsername) {
    try {
      lcStats = await fetchLeetCodeStats(leetcodeUsername);
      console.log(`✅ LeetCode: ${lcStats.totalSolved} solved`);
    } catch (err) {
      console.error(`❌ LeetCode sync failed for ${leetcodeUsername}:`, err);
    }
    await sleep(1000);
  }

  if (codeforcesHandle) {
    try {
      cfStats = await fetchCodeforcesStats(codeforcesHandle);
      console.log(`✅ Codeforces: ${cfStats.solved} solved, rating ${cfStats.rating}`);
    } catch (err) {
      console.error(`❌ Codeforces sync failed for ${codeforcesHandle}:`, err);
    }
    await sleep(250);
  }

  const today        = new Date().toISOString().slice(0, 10);
  const lcSolvedTotal = lcStats?.totalSolved ?? 0;
  const cfSolvedTotal = cfStats?.solved       ?? 0;
  const grandTotal    = lcSolvedTotal + cfSolvedTotal;

  // Store cumulative totals per day (one document per user per day, upserted)
  await DailySolveLog.findOneAndUpdate(
    { user_id: userId, date: today },
    {
      $set: {
        user_id:      userId,
        date:         today,
        lc_solved:    lcSolvedTotal,
        cf_solved:    cfSolvedTotal,
        total_solved: grandTotal,
      },
    },
    { upsert: true, new: true }
  );

  // Compute streak based on day-over-day deltas
  const { current, longest } = await computeStreak(userId);

  // Upsert coding_stats in Postgres
  const { error } = await supabase.from("coding_stats").upsert(
    {
      user_id:         userId,
      lc_total_solved: lcStats?.totalSolved  ?? 0,
      lc_easy:         lcStats?.easySolved   ?? 0,
      lc_medium:       lcStats?.mediumSolved ?? 0,
      lc_hard:         lcStats?.hardSolved   ?? 0,
      lc_rating:       lcStats?.ranking      ?? 0,
      cf_solved:       cfStats?.solved       ?? 0,
      cf_rating:       cfStats?.rating       ?? 0,
      cf_max_rating:   cfStats?.maxRating    ?? 0,
      current_streak:  current,
      longest_streak:  longest,
      last_synced:     new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) {
    console.error(`❌ coding_stats upsert failed for ${userId}:`, error.message);
    throw error;
  }

  console.log(`✅ Coding sync complete for ${userId}. Streak: ${current} days`);
};