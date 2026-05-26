"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recomputeAllScores = exports.computeScore = void 0;
const db_1 = require("../config/db");
const db_2 = require("../config/db");
const constants_1 = require("../utils/constants");
// Normalize a value to 0–100 given a max cap
const norm = (val, max) => Math.min(100, Math.max(0, (val / max) * 100));
const computeScore = (academic, coding, github) => {
    // ── Academics (0–100) ──────────────────────────────────────
    const tenthNorm = norm(academic.tenth_percentage ?? 0, constants_1.SCORE_WEIGHTS.TENTH_MAX);
    const twelfthNorm = norm(academic.twelfth_percentage ?? 0, constants_1.SCORE_WEIGHTS.TWELFTH_MAX);
    const cpiNorm = norm((academic.cpi ?? 0) * 10, constants_1.SCORE_WEIGHTS.TENTH_MAX); // CPI×10 → % scale
    // Average of available academics (skip nulls)
    const availableAcademics = [];
    if (academic.tenth_percentage !== null && academic.tenth_percentage !== undefined)
        availableAcademics.push(tenthNorm);
    if (academic.twelfth_percentage !== null && academic.twelfth_percentage !== undefined)
        availableAcademics.push(twelfthNorm);
    if (academic.cpi !== null && academic.cpi !== undefined)
        availableAcademics.push(cpiNorm);
    const academicsNorm = availableAcademics.length > 0
        ? availableAcademics.reduce((a, b) => a + b, 0) / availableAcademics.length
        : 0;
    // ── Coding (0–100) ────────────────────────────────────────
    const lcNorm = norm(coding.lc_total_solved ?? 0, constants_1.SCORE_WEIGHTS.LC_SOLVED_MAX);
    const cfNorm = norm(coding.cf_rating ?? 0, constants_1.SCORE_WEIGHTS.CF_RATING_MAX);
    // 60% LeetCode + 40% CF
    const codingNorm = lcNorm * (1 - constants_1.SCORE_WEIGHTS.CF_WEIGHT) + cfNorm * constants_1.SCORE_WEIGHTS.CF_WEIGHT;
    // ── Development (0–100) ──────────────────────────────────
    const commits = (github.total_commits ?? 0) + (github.code_commits ?? 0);
    const devNorm = norm(commits, constants_1.SCORE_WEIGHTS.GITHUB_MAX);
    // ── Weighted Total (0–1000) ───────────────────────────────
    const academicsScore = Math.round(academicsNorm * constants_1.SCORE_WEIGHTS.ACADEMICS_WEIGHT * 1000);
    const codingScore = Math.round(codingNorm * constants_1.SCORE_WEIGHTS.CODING_WEIGHT * 1000);
    const devScore = Math.round(devNorm * constants_1.SCORE_WEIGHTS.DEV_WEIGHT * 1000);
    const totalScore = academicsScore + codingScore + devScore;
    return { academicsScore, codingScore, devScore, totalScore };
};
exports.computeScore = computeScore;
// ─── Recompute ALL scores and update Redis + Postgres ────────
const recomputeAllScores = async () => {
    console.log("🔄 Recomputing all UTPT scores...");
    const existingKeys = await db_2.redis.keys("leaderboard:*");
    if (existingKeys.length > 0) {
        await db_2.redis.del(...existingKeys);
    }
    const { data: users } = await db_1.supabase
        .from("users")
        .select("id, batch, specialization, tenth_percentage, twelfth_percentage, cpi")
        .eq("role", "student")
        .eq("is_active", true)
        .eq("top_label", 1);
    if (!users || users.length === 0) {
        console.log("No active students found");
        return;
    }
    const { data: codingStats } = await db_1.supabase
        .from("coding_stats")
        .select("user_id, lc_total_solved, lc_easy, lc_medium, lc_hard, cf_rating, cf_solved, current_streak");
    const { data: githubStats } = await db_1.supabase
        .from("github_stats")
        .select("user_id, total_commits, code_commits");
    const codingMap = new Map((codingStats || []).map((c) => [c.user_id, c]));
    const githubMap = new Map((githubStats || []).map((g) => [g.user_id, g]));
    const scores = [];
    for (const user of users) {
        const coding = codingMap.get(user.id) || {
            lc_total_solved: 0, lc_easy: 0, lc_medium: 0, lc_hard: 0,
            cf_rating: 0, cf_solved: 0, current_streak: 0,
        };
        const github = githubMap.get(user.id) || { total_commits: 0, code_commits: 0 };
        const academic = {
            tenth_percentage: user.tenth_percentage ?? null,
            twelfth_percentage: user.twelfth_percentage ?? null,
            cpi: user.cpi ?? null,
        };
        const { academicsScore, codingScore, devScore, totalScore } = (0, exports.computeScore)(academic, coding, github);
        await db_1.supabase.from("scores").upsert({
            user_id: user.id,
            academics_score: academicsScore,
            coding_score: codingScore,
            dev_score: devScore,
            total_score: totalScore,
            last_computed: new Date().toISOString(),
        }, { onConflict: "user_id" });
        scores.push({
            userId: user.id,
            total: totalScore,
            batch: user.batch || "unknown",
            spec: user.specialization || "unknown",
        });
        await db_2.redis.zadd("leaderboard:global", totalScore, user.id);
        if (user.batch)
            await db_2.redis.zadd(`leaderboard:batch:${user.batch}`, totalScore, user.id);
        if (user.specialization)
            await db_2.redis.zadd(`leaderboard:spec:${user.specialization}`, totalScore, user.id);
    }
    await db_2.redis.expire("leaderboard:global", 2 * 60 * 60);
    const sorted = scores.sort((a, b) => b.total - a.total);
    for (let i = 0; i < sorted.length; i++) {
        await db_1.supabase
            .from("scores")
            .update({ rank: i + 1 })
            .eq("user_id", sorted[i].userId);
    }
    console.log(`✅ UTPT scores recomputed for ${users.length} students`);
};
exports.recomputeAllScores = recomputeAllScores;
