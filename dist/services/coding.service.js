"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncUserCoding = void 0;
const db_1 = require("../config/db");
const DailySolveLog_model_1 = require("../models/DailySolveLog.model");
const leetcode_service_1 = require("./leetcode.service");
const codeforces_service_1 = require("./codeforces.service");
// ─── Sleep helper for rate limiting ─────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// ─── Streak calculation ──────────────────────────────────────
const computeStreak = async (userId) => {
    // Get last 100 days of logs sorted by date desc
    const logs = await DailySolveLog_model_1.DailySolveLog.find({ user_id: userId })
        .sort({ date: -1 })
        .limit(100)
        .lean();
    if (logs.length === 0)
        return { current: 0, longest: 0 };
    let current = 0;
    let longest = 0;
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < logs.length; i++) {
        const logDate = new Date(logs[i].date);
        const expected = new Date(today);
        expected.setDate(today.getDate() - i);
        const sameDay = logDate.toISOString().slice(0, 10) ===
            expected.toISOString().slice(0, 10);
        if (sameDay && logs[i].total_solved > 0) {
            streak++;
            if (i === 0)
                current = streak;
            if (streak > longest)
                longest = streak;
        }
        else {
            if (i === 0)
                current = 0; // broke today
            break;
        }
    }
    return { current, longest };
};
// ─── Main sync function ──────────────────────────────────────
const syncUserCoding = async (userId, leetcodeUsername, codeforcesHandle) => {
    console.log(`🔄 Syncing coding stats for user ${userId}`);
    let lcStats = null;
    let cfStats = null;
    // Fetch LeetCode stats
    if (leetcodeUsername) {
        try {
            lcStats = await (0, leetcode_service_1.fetchLeetCodeStats)(leetcodeUsername);
            console.log(`✅ LeetCode: ${lcStats.totalSolved} solved`);
        }
        catch (err) {
            console.error(`❌ LeetCode sync failed:`, err);
        }
        await sleep(1000); // 1 second between calls
    }
    // Fetch Codeforces stats
    if (codeforcesHandle) {
        try {
            cfStats = await (0, codeforces_service_1.fetchCodeforcesStats)(codeforcesHandle);
            console.log(`✅ Codeforces: ${cfStats.solved} solved, rating ${cfStats.rating}`);
        }
        catch (err) {
            console.error(`❌ Codeforces sync failed:`, err);
        }
        await sleep(250);
    }
    const today = new Date().toISOString().slice(0, 10); // "2026-05-03"
    const lcSolvedToday = lcStats?.totalSolved || 0;
    const cfSolvedToday = cfStats?.solved || 0;
    const totalToday = lcSolvedToday + cfSolvedToday;
    // Upsert DailySolveLog for today
    await DailySolveLog_model_1.DailySolveLog.findOneAndUpdate({ user_id: userId, date: today }, {
        $set: {
            user_id: userId,
            date: today,
            lc_solved: lcSolvedToday,
            cf_solved: cfSolvedToday,
            total_solved: totalToday,
        },
    }, { upsert: true, new: true });
    // Compute streak from MongoDB logs
    const { current, longest } = await computeStreak(userId);
    // Upsert coding_stats in Postgres
    await db_1.supabase.from("coding_stats").upsert({
        user_id: userId,
        lc_total_solved: lcStats?.totalSolved || 0,
        lc_easy: lcStats?.easySolved || 0,
        lc_medium: lcStats?.mediumSolved || 0,
        lc_hard: lcStats?.hardSolved || 0,
        lc_rating: lcStats?.ranking || 0,
        cf_solved: cfStats?.solved || 0,
        cf_rating: cfStats?.rating || 0,
        cf_max_rating: cfStats?.maxRating || 0,
        current_streak: current,
        longest_streak: longest,
        last_synced: new Date().toISOString(),
    });
    console.log(`✅ Coding sync complete. Streak: ${current} days`);
};
exports.syncUserCoding = syncUserCoding;
