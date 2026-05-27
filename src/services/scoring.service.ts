import { supabase } from "../config/db";
import { redis } from "../config/db";
import { SCORE_WEIGHTS as W } from "../utils/constants";

// ─── UTPT Score Formula ──────────────────────────────────────
// Total Score  0 – 1000
//   Academics  30%  → max 300 pts  (10th, 12th, CPI averaged)
//   Coding     50%  → max 500 pts  (60% LeetCode + 40% Codeforces)
//   Dev        20%  → max 200 pts  (GitHub code commits)
//
// Each component is first normalised to 0–100, then:
//   component_score = round(normalised_0_100 / 100 * weight * 1000)
// ────────────────────────────────────────────────────────────

export interface AcademicData {
  tenth_percentage:   number | null;
  twelfth_percentage: number | null;
  cpi:                number | null;
}

interface CodingStats {
  user_id:         string;
  lc_total_solved: number;
  cf_rating:       number;
  cf_solved:       number;
  current_streak:  number;
  [key: string]:   any;
}

interface GithubStats {
  user_id:       string;
  total_commits: number;
  code_commits:  number;
  [key: string]: any;
}

// Clamp a value to 0–100 given a maximum cap
const norm = (val: number, max: number): number =>
  Math.min(100, Math.max(0, (val / max) * 100));

// ─── Public: compute score for one student ───────────────────
export const computeScore = (
  academic: AcademicData,
  coding:   Partial<CodingStats>,
  github:   Partial<GithubStats>
) => {
  // ── Academics (0–100) ──────────────────────────────────────
  // CPI is on a 10-point scale; multiply by 10 before normalising to %
  const tenthNorm   = norm(academic.tenth_percentage   ?? 0, W.TENTH_MAX);
  const twelfthNorm = norm(academic.twelfth_percentage ?? 0, W.TWELFTH_MAX);
  const cpiNorm     = norm((academic.cpi ?? 0) * 10,        W.TENTH_MAX); // CPI×10 → % scale

  // Average only the fields that are actually present (skip nulls)
  const available: number[] = [];
  if (academic.tenth_percentage   != null) available.push(tenthNorm);
  if (academic.twelfth_percentage != null) available.push(twelfthNorm);
  if (academic.cpi                != null) available.push(cpiNorm);

  const academicsNorm = available.length > 0
    ? available.reduce((a, b) => a + b, 0) / available.length
    : 0;

  // ── Coding (0–100) ────────────────────────────────────────
  const lcNorm   = norm(coding.lc_total_solved ?? 0, W.LC_SOLVED_MAX);
  const cfNorm   = norm(coding.cf_rating       ?? 0, W.CF_RATING_MAX);
  // 60% LeetCode weight + 40% Codeforces weight
  const codingNorm = lcNorm * (1 - W.CF_WEIGHT) + cfNorm * W.CF_WEIGHT;

  // ── Development (0–100) ──────────────────────────────────
  // Use code_commits only (meaningful commits).
  // code_commits is already a filtered subset of total_commits,
  // so summing both would double-count — use code_commits exclusively.
  const codeCommits = github.code_commits ?? github.total_commits ?? 0;
  const devNorm     = norm(codeCommits, W.GITHUB_MAX);

  // ── Weighted Total (0–1000) ───────────────────────────────
  // Divide normalised value by 100 before applying weight × 1000
  // so the max possible per component is:
  //   academics: 100/100 × 0.30 × 1000 = 300
  //   coding:    100/100 × 0.50 × 1000 = 500
  //   dev:       100/100 × 0.20 × 1000 = 200
  const academicsScore = Math.round((academicsNorm / 100) * W.ACADEMICS_WEIGHT * 1000);
  const codingScore    = Math.round((codingNorm    / 100) * W.CODING_WEIGHT    * 1000);
  const devScore       = Math.round((devNorm       / 100) * W.DEV_WEIGHT       * 1000);
  const totalScore     = academicsScore + codingScore + devScore;

  return { academicsScore, codingScore, devScore, totalScore };
};

// ─── Recompute ALL scores, update Postgres + Redis ───────────
export const recomputeAllScores = async (): Promise<void> => {
  console.log("🔄 Recomputing all UTPT scores...");

  // Clear existing leaderboard keys safely (del() with no args throws)
  const existingKeys = await redis.keys("leaderboard:*");
  if (existingKeys.length > 0) {
    await redis.del(...existingKeys);
  }

  // Only active portal students (top_label=1) appear on the leaderboard
  const { data: users, error: usersErr } = await supabase
    .from("users")
    .select("id, batch, specialization, tenth_percentage, twelfth_percentage, cpi")
    .eq("role",      "student")
    .eq("is_active", true)
    .eq("top_label", 1);

  if (usersErr) {
    console.error("recomputeAllScores: failed to fetch users:", usersErr.message);
    return;
  }

  if (!users || users.length === 0) {
    console.log("No active portal students found — leaderboard is empty.");
    return;
  }

  const { data: codingStats } = await supabase
    .from("coding_stats")
    .select("user_id, lc_total_solved, cf_rating, cf_solved, current_streak");

  const { data: githubStats } = await supabase
    .from("github_stats")
    .select("user_id, total_commits, code_commits");

  const codingMap = new Map((codingStats || []).map((c) => [c.user_id, c]));
  const githubMap = new Map((githubStats || []).map((g) => [g.user_id, g]));

  const scores: { userId: string; total: number; batch: string; spec: string }[] = [];

  for (const user of users) {
    const coding = codingMap.get(user.id) ?? {
      lc_total_solved: 0, cf_rating: 0, cf_solved: 0, current_streak: 0,
    };
    const github = githubMap.get(user.id) ?? { total_commits: 0, code_commits: 0 };

    const academic: AcademicData = {
      tenth_percentage:   user.tenth_percentage   ?? null,
      twelfth_percentage: user.twelfth_percentage ?? null,
      cpi:                user.cpi                ?? null,
    };

    const { academicsScore, codingScore, devScore, totalScore } =
      computeScore(academic, coding, github);

    // Upsert score row in Postgres
    const { error: upsertErr } = await supabase.from("scores").upsert(
      {
        user_id:         user.id,
        academics_score: academicsScore,
        coding_score:    codingScore,
        dev_score:       devScore,
        total_score:     totalScore,
        last_computed:   new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    if (upsertErr) {
      console.error(`Score upsert failed for ${user.id}:`, upsertErr.message);
      continue;
    }

    // Push into Redis sorted sets
    await redis.zadd("leaderboard:global", totalScore, user.id);
    if (user.batch)          await redis.zadd(`leaderboard:batch:${user.batch}`,       totalScore, user.id);
    if (user.specialization) await redis.zadd(`leaderboard:spec:${user.specialization}`, totalScore, user.id);

    scores.push({
      userId: user.id,
      total:  totalScore,
      batch:  user.batch         || "unknown",
      spec:   user.specialization || "unknown",
    });
  }

  // Set 2-hour TTL on global leaderboard key
  if (scores.length > 0) {
    await redis.expire("leaderboard:global", 2 * 60 * 60);
  }

  // Persist global rank numbers in Postgres (sorted descending)
  const sorted = [...scores].sort((a, b) => b.total - a.total);
  for (let i = 0; i < sorted.length; i++) {
    await supabase
      .from("scores")
      .update({ rank: i + 1 })
      .eq("user_id", sorted[i].userId);
  }

  console.log(`✅ UTPT scores recomputed for ${users.length} students`);
};

// ─── Recompute score for a SINGLE student ───────────────────
// Called after auto-sync so the leaderboard updates immediately
export const recomputeUserScore = async (userId: string): Promise<void> => {
  const [userRes, codingRes, githubRes] = await Promise.all([
    supabase.from("users").select("batch, specialization, tenth_percentage, twelfth_percentage, cpi, is_active, top_label").eq("id", userId).single(),
    supabase.from("coding_stats").select("lc_total_solved, cf_rating, cf_solved, current_streak").eq("user_id", userId).single(),
    supabase.from("github_stats").select("total_commits, code_commits").eq("user_id", userId).single(),
  ]);

  if (!userRes.data) return;
  const user   = userRes.data;
  const coding = codingRes.data ?? { lc_total_solved: 0, cf_rating: 0, cf_solved: 0, current_streak: 0 };
  const github = githubRes.data ?? { total_commits: 0, code_commits: 0 };

  const { academicsScore, codingScore, devScore, totalScore } = computeScore(
    {
      tenth_percentage:   user.tenth_percentage   ?? null,
      twelfth_percentage: user.twelfth_percentage ?? null,
      cpi:                user.cpi                ?? null,
    },
    coding,
    github
  );

  await supabase.from("scores").upsert(
    {
      user_id:         userId,
      academics_score: academicsScore,
      coding_score:    codingScore,
      dev_score:       devScore,
      total_score:     totalScore,
      last_computed:   new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  // Only update Redis if this is an active portal student
  if (user.is_active && user.top_label === 1) {
    await redis.zadd("leaderboard:global", totalScore, userId);
    if (user.batch)          await redis.zadd(`leaderboard:batch:${user.batch}`,       totalScore, userId);
    if (user.specialization) await redis.zadd(`leaderboard:spec:${user.specialization}`, totalScore, userId);
  }
};