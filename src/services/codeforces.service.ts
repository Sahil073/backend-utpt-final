import axios from "axios";

export interface CodeforcesStats {
  solved: number;
  rating: number;
  maxRating: number;
}

const CF_BASE = "https://codeforces.com/api";

export const fetchCodeforcesStats = async (
  handle: string
): Promise<CodeforcesStats> => {
  // Get user rating info
  const userRes = await axios.get(`${CF_BASE}/user.info?handles=${handle}`, {
    timeout: 10000,
  });

  if (userRes.data.status !== "OK") {
    throw new Error(`Codeforces user "${handle}" not found`);
  }

  const user = userRes.data.result[0];

  // Fetch all submissions in batches of 1000 until we have them all
  const solvedSet = new Set<string>();
  let from = 1;
  const batchSize = 1000;

  while (true) {
    const subRes = await axios.get(
      `${CF_BASE}/user.status?handle=${handle}&from=${from}&count=${batchSize}`,
      { timeout: 15000 }
    );

    if (subRes.data.status !== "OK") break;

    const batch: any[] = subRes.data.result || [];

    for (const sub of batch) {
      if (sub.verdict === "OK" && sub.problem) {
        solvedSet.add(`${sub.problem.contestId}-${sub.problem.index}`);
      }
    }

    // If batch is smaller than batchSize, we've fetched everything
    if (batch.length < batchSize) break;

    from += batchSize;

    // Safety cap: don't fetch more than 10,000 submissions
    if (from > 10000) break;
  }

  return {
    solved:    solvedSet.size,
    rating:    user.rating    ?? 0,
    maxRating: user.maxRating ?? 0,
  };
};
