"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.invalidateLeaderboardCache = exports.invalidateUserCache = void 0;
const db_1 = require("../config/db");
const invalidateUserCache = async (userId) => {
    await db_1.redis.del(`user:profile:${userId}`);
    await db_1.redis.del(`user:stats:${userId}`);
    console.log(`🗑️  Cache invalidated for user ${userId}`);
};
exports.invalidateUserCache = invalidateUserCache;
const invalidateLeaderboardCache = async () => {
    // Get all leaderboard keys and delete them
    const keys = await db_1.redis.keys("leaderboard:*");
    if (keys.length > 0) {
        await db_1.redis.del(...keys);
        console.log(`🗑️  Leaderboard cache cleared (${keys.length} keys)`);
    }
};
exports.invalidateLeaderboardCache = invalidateLeaderboardCache;
