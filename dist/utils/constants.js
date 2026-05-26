"use strict";
// ─── UTPT Score Weights ───────────────────────────────────────
// Formula: Academics 30% + Coding 50% + Development 20%
// Each component is normalized 0–100 then weighted to give a 0–1000 total
Object.defineProperty(exports, "__esModule", { value: true });
exports.SCORE_WEIGHTS = void 0;
exports.SCORE_WEIGHTS = {
    // Academics (30% of 1000 = 300 points max)
    ACADEMICS_WEIGHT: 0.30,
    // Coding (50% of 1000 = 500 points max)
    CODING_WEIGHT: 0.50,
    // Development (20% of 1000 = 200 points max)
    DEV_WEIGHT: 0.20,
    // Normalization caps for individual metrics
    TENTH_MAX: 100, // out of 100%
    TWELFTH_MAX: 100, // out of 100%
    CPI_MAX: 10, // CGPA scale
    LC_SOLVED_MAX: 600, // LeetCode solved cap for normalization
    CF_RATING_MAX: 2400, // Codeforces rating cap
    CF_WEIGHT: 0.40, // 40% of coding from CF, 60% from LC
    GITHUB_MAX: 500, // Commits cap for dev score
    // Legacy fields kept for backward compat
    LC_EASY: 2,
    LC_MEDIUM: 5,
    LC_HARD: 15,
    CF_SOLVED: 4,
    STREAK: 3,
    STREAK_CAP: 90,
    GITHUB: 2,
    GITHUB_CAP: 200,
    ACTIVITY: 5,
    ACTIVITY_CAP: 150,
};
