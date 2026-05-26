"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchCodeforcesStats = void 0;
const axios_1 = __importDefault(require("axios"));
const CF_BASE = "https://codeforces.com/api";
const fetchCodeforcesStats = async (handle) => {
    // Get user rating info
    const userRes = await axios_1.default.get(`${CF_BASE}/user.info?handles=${handle}`, {
        timeout: 10000,
    });
    if (userRes.data.status !== "OK") {
        throw new Error(`Codeforces user "${handle}" not found`);
    }
    const user = userRes.data.result[0];
    // Fetch all submissions in batches of 1000 until we have them all
    const solvedSet = new Set();
    let from = 1;
    const batchSize = 1000;
    while (true) {
        const subRes = await axios_1.default.get(`${CF_BASE}/user.status?handle=${handle}&from=${from}&count=${batchSize}`, { timeout: 15000 });
        if (subRes.data.status !== "OK")
            break;
        const batch = subRes.data.result || [];
        for (const sub of batch) {
            if (sub.verdict === "OK" && sub.problem) {
                solvedSet.add(`${sub.problem.contestId}-${sub.problem.index}`);
            }
        }
        // If batch is smaller than batchSize, we've fetched everything
        if (batch.length < batchSize)
            break;
        from += batchSize;
        // Safety cap: don't fetch more than 10,000 submissions
        if (from > 10000)
            break;
    }
    return {
        solved: solvedSet.size,
        rating: user.rating ?? 0,
        maxRating: user.maxRating ?? 0,
    };
};
exports.fetchCodeforcesStats = fetchCodeforcesStats;
