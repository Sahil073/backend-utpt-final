"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMyRank = exports.getFilteredLeaderboard = exports.getSpecLeaderboard = exports.getBatchLeaderboard = exports.getGlobalLeaderboard = void 0;
const db_1 = require("../config/db");
const db_2 = require("../config/db");
const enrichLeaderboard = async (entries) => {
    if (entries.length === 0)
        return [];
    const ids = entries.map((e) => e.userId);
    const { data: users } = await db_1.supabase
        .from("users")
        .select("id, name, username, avatar_url, batch, specialization, college_id")
        .in("id", ids);
    const { data: codingStats } = await db_1.supabase
        .from("coding_stats")
        .select("user_id, lc_total_solved, cf_rating")
        .in("user_id", ids);
    const { data: githubStats } = await db_1.supabase
        .from("github_stats")
        .select("user_id, total_commits")
        .in("user_id", ids);
    const { data: scoreData } = await db_1.supabase
        .from("scores")
        .select("user_id, academics_score, coding_score, dev_score, total_score")
        .in("user_id", ids);
    const userMap = new Map((users || []).map((u) => [u.id, u]));
    const codingMap = new Map((codingStats || []).map((c) => [c.user_id, c]));
    const githubMap = new Map((githubStats || []).map((g) => [g.user_id, g]));
    const scoreMap = new Map((scoreData || []).map((s) => [s.user_id, s]));
    return entries.map((e) => ({
        rank: e.rank,
        total_score: e.score,
        user_id: e.userId,
        id: e.userId,
        name: userMap.get(e.userId)?.name || "Unknown",
        username: userMap.get(e.userId)?.username || "",
        avatar_url: userMap.get(e.userId)?.avatar_url || null,
        batch: userMap.get(e.userId)?.batch || "",
        specialization: userMap.get(e.userId)?.specialization || "",
        college_id: userMap.get(e.userId)?.college_id || "",
        leetcode_solved: codingMap.get(e.userId)?.lc_total_solved ?? null,
        codeforces_rating: codingMap.get(e.userId)?.cf_rating ?? null,
        total_commits: githubMap.get(e.userId)?.total_commits ?? null,
        academics_score: scoreMap.get(e.userId)?.academics_score ?? null,
        coding_score: scoreMap.get(e.userId)?.coding_score ?? null,
        dev_score: scoreMap.get(e.userId)?.dev_score ?? null,
    }));
};
const getLeaderboardFromRedis = async (key, page, limit) => {
    const start = (page - 1) * limit;
    const end = start + limit - 1;
    const raw = await db_2.redis.zrevrange(key, start, end, "WITHSCORES");
    const entries = [];
    for (let i = 0; i < raw.length; i += 2) {
        entries.push({
            userId: raw[i],
            score: parseInt(raw[i + 1]),
            rank: start + Math.floor(i / 2) + 1,
        });
    }
    return entries;
};
// ────────────────────────────────────────────────────────────
// GET /leaderboard/global
// ────────────────────────────────────────────────────────────
const getGlobalLeaderboard = async (req, res) => {
    try {
        const page = parseInt(req.query.page || "1");
        const limit = 50;
        const exists = await db_2.redis.exists("leaderboard:global");
        if (!exists) {
            const { recomputeAllScores } = await Promise.resolve().then(() => __importStar(require("../services/scoring.service")));
            await recomputeAllScores();
        }
        const entries = await getLeaderboardFromRedis("leaderboard:global", page, limit);
        const data = await enrichLeaderboard(entries);
        res.status(200).json({
            success: true,
            data,
            message: "Global leaderboard fetched",
        });
    }
    catch (err) {
        console.error("getGlobalLeaderboard error:", err);
        res.status(500).json({ success: false, data: null, message: "Internal server error" });
    }
};
exports.getGlobalLeaderboard = getGlobalLeaderboard;
// ────────────────────────────────────────────────────────────
// GET /leaderboard/batch/:batch
// ────────────────────────────────────────────────────────────
const getBatchLeaderboard = async (req, res) => {
    try {
        const { batch } = req.params;
        const page = parseInt(req.query.page || "1");
        const limit = 50;
        const key = `leaderboard:batch:${batch}`;
        const exists = await db_2.redis.exists(key);
        if (!exists) {
            const { recomputeAllScores } = await Promise.resolve().then(() => __importStar(require("../services/scoring.service")));
            await recomputeAllScores();
        }
        const entries = await getLeaderboardFromRedis(key, page, limit);
        const data = await enrichLeaderboard(entries);
        res.status(200).json({ success: true, data, message: `Batch ${batch} leaderboard fetched` });
    }
    catch (err) {
        console.error("getBatchLeaderboard error:", err);
        res.status(500).json({ success: false, data: null, message: "Internal server error" });
    }
};
exports.getBatchLeaderboard = getBatchLeaderboard;
// ────────────────────────────────────────────────────────────
// GET /leaderboard/specialization/:spec
// ────────────────────────────────────────────────────────────
const getSpecLeaderboard = async (req, res) => {
    try {
        const { spec } = req.params;
        const page = parseInt(req.query.page || "1");
        const limit = 50;
        const key = `leaderboard:spec:${spec}`;
        const exists = await db_2.redis.exists(key);
        if (!exists) {
            const { recomputeAllScores } = await Promise.resolve().then(() => __importStar(require("../services/scoring.service")));
            await recomputeAllScores();
        }
        const entries = await getLeaderboardFromRedis(key, page, limit);
        const data = await enrichLeaderboard(entries);
        res.status(200).json({ success: true, data, message: `${spec} leaderboard fetched` });
    }
    catch (err) {
        console.error("getSpecLeaderboard error:", err);
        res.status(500).json({ success: false, data: null, message: "Internal server error" });
    }
};
exports.getSpecLeaderboard = getSpecLeaderboard;
// ────────────────────────────────────────────────────────────
// GET /leaderboard/filter
// Query: ?metric=total|coding|academic|dev&batch=&specialization=&limit=50&page=1
// Flexible leaderboard that supports different score dimensions
// ────────────────────────────────────────────────────────────
const getFilteredLeaderboard = async (req, res) => {
    try {
        const { metric = "total", batch, specialization, page = "1", limit: limitStr = "50", } = req.query;
        const pageNum = Math.max(1, parseInt(page));
        const limit = Math.min(100, parseInt(limitStr) || 50);
        const offset = (pageNum - 1) * limit;
        // Map metric to score column
        const metricCol = {
            total: "total_score",
            coding: "coding_score",
            academic: "academics_score",
            dev: "dev_score",
        };
        const scoreCol = metricCol[metric] || "total_score";
        // Build users query to get student IDs matching filters
        let userQuery = db_1.supabase
            .from("users")
            .select("id")
            .eq("role", "student")
            .eq("is_active", true)
            .eq("top_label", 1);
        if (batch)
            userQuery = userQuery.eq("batch", batch);
        if (specialization)
            userQuery = userQuery.eq("specialization", specialization);
        const { data: matchedUsers } = await userQuery;
        if (!matchedUsers || matchedUsers.length === 0) {
            res.status(200).json({ success: true, data: [], message: "No students match the filter" });
            return;
        }
        const userIds = matchedUsers.map((u) => u.id);
        // Fetch scores for those users, ordered by the selected metric
        const { data: scores, error } = await db_1.supabase
            .from("scores")
            .select(`user_id, total_score, academics_score, coding_score, dev_score`)
            .in("user_id", userIds)
            .order(scoreCol, { ascending: false })
            .range(offset, offset + limit - 1);
        if (error) {
            res.status(500).json({ success: false, data: null, message: error.message });
            return;
        }
        // Enrich with user info + coding/github
        const scoreIds = (scores || []).map((s) => s.user_id);
        if (scoreIds.length === 0) {
            res.status(200).json({ success: true, data: [], message: "No scores found" });
            return;
        }
        const [usersRes, codingRes, githubRes] = await Promise.all([
            db_1.supabase.from("users").select("id, name, username, avatar_url, batch, specialization, college_id").in("id", scoreIds),
            db_1.supabase.from("coding_stats").select("user_id, lc_total_solved, cf_rating").in("user_id", scoreIds),
            db_1.supabase.from("github_stats").select("user_id, total_commits").in("user_id", scoreIds),
        ]);
        const userMap = new Map((usersRes.data || []).map((u) => [u.id, u]));
        const codingMap = new Map((codingRes.data || []).map((c) => [c.user_id, c]));
        const githubMap = new Map((githubRes.data || []).map((g) => [g.user_id, g]));
        const data = (scores || []).map((s, idx) => ({
            rank: offset + idx + 1,
            user_id: s.user_id,
            id: s.user_id,
            name: userMap.get(s.user_id)?.name || "Unknown",
            username: userMap.get(s.user_id)?.username || "",
            avatar_url: userMap.get(s.user_id)?.avatar_url || null,
            batch: userMap.get(s.user_id)?.batch || "",
            specialization: userMap.get(s.user_id)?.specialization || "",
            college_id: userMap.get(s.user_id)?.college_id || "",
            total_score: s.total_score,
            academics_score: s.academics_score,
            coding_score: s.coding_score,
            dev_score: s.dev_score,
            metric_score: s[scoreCol],
            leetcode_solved: codingMap.get(s.user_id)?.lc_total_solved ?? null,
            codeforces_rating: codingMap.get(s.user_id)?.cf_rating ?? null,
            total_commits: githubMap.get(s.user_id)?.total_commits ?? null,
        }));
        res.status(200).json({
            success: true,
            data,
            meta: { metric, batch: batch || null, specialization: specialization || null, page: pageNum, limit },
            message: `Filtered leaderboard (${metric}) fetched`,
        });
    }
    catch (err) {
        console.error("getFilteredLeaderboard error:", err);
        res.status(500).json({ success: false, data: null, message: "Internal server error" });
    }
};
exports.getFilteredLeaderboard = getFilteredLeaderboard;
// ────────────────────────────────────────────────────────────
// GET /leaderboard/my-rank
// ────────────────────────────────────────────────────────────
const getMyRank = async (req, res) => {
    try {
        const userId = req.user.id;
        const rankRaw = await db_2.redis.zrevrank("leaderboard:global", userId);
        if (rankRaw === null) {
            res.status(200).json({
                success: true,
                data: { rank: null, score: 0, neighbors: [] },
                message: "Not ranked yet",
            });
            return;
        }
        const myRank = rankRaw + 1;
        const myScore = await db_2.redis.zscore("leaderboard:global", userId);
        const start = Math.max(0, rankRaw - 5);
        const end = rankRaw + 5;
        const raw = await db_2.redis.zrevrange("leaderboard:global", start, end, "WITHSCORES");
        const neighbourEntries = [];
        for (let i = 0; i < raw.length; i += 2) {
            neighbourEntries.push({
                userId: raw[i],
                score: parseInt(raw[i + 1]),
                rank: start + Math.floor(i / 2) + 1,
            });
        }
        const neighbours = await enrichLeaderboard(neighbourEntries);
        res.status(200).json({
            success: true,
            data: {
                rank: myRank,
                score: parseInt(myScore || "0"),
                neighbors: neighbours,
            },
            message: "Your rank fetched",
        });
    }
    catch (err) {
        console.error("getMyRank error:", err);
        res.status(500).json({ success: false, data: null, message: "Internal server error" });
    }
};
exports.getMyRank = getMyRank;
