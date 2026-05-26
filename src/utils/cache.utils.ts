import { redis } from "../config/db";

export const invalidateUserCache = async (userId: string): Promise<void> => {
  await redis.del(`user:profile:${userId}`);
  await redis.del(`user:stats:${userId}`);
  console.log(`🗑️  Cache invalidated for user ${userId}`);
};

export const invalidateLeaderboardCache = async (): Promise<void> => {
  // Get all leaderboard keys and delete them
  const keys = await redis.keys("leaderboard:*");
  if (keys.length > 0) {
    await redis.del(...keys);
    console.log(`🗑️  Leaderboard cache cleared (${keys.length} keys)`);
  }
};