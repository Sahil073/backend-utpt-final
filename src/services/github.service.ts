import axios from "axios";
import { ENV } from "../config/env";
import { supabase } from "../config/db";
import { CommitLog } from "../models/CommitLog.model";

const githubAPI = axios.create({
  baseURL: "https://api.github.com",
  headers: {
    Authorization: `Bearer ${ENV.GITHUB_TOKEN}`,
    Accept: "application/vnd.github.v3+json",
  },
});

// ─── Commit Classifier ───────────────────────────────────────
const TRIVIAL_PATTERNS = [
  /^fix typo/i,
  /^update readme/i,
  /^formatting/i,
  /^whitespace/i,
  /^merge branch/i,
  /^initial commit/i,
  /^add \.gitignore/i,
  /^bump version/i,
  /^wip/i,
  /^minor fix/i,
  /^cleanup/i,
];

const classifyCommit = (message: string): "code" | "trivial" => {
  return TRIVIAL_PATTERNS.some((p) => p.test(message)) ? "trivial" : "code";
};

// ─── Fetch user repos ────────────────────────────────────────
const getUserRepos = async (username: string): Promise<string[]> => {
  const { data } = await githubAPI.get(`/users/${username}/repos`, {
    params: { per_page: 50, sort: "updated" },
  });
  return data.map((r: { name: string }) => r.name);
};

// ─── Fetch commits from one repo ────────────────────────────
const getCommitsFromRepo = async (
  username: string,
  repo: string
): Promise<{ sha: string; message: string; date: string }[]> => {
  try {
    const since = new Date();
    since.setDate(since.getDate() - 30); // last 30 days

    const { data } = await githubAPI.get(
      `/repos/${username}/${repo}/commits`,
      {
        params: {
          author: username,
          since: since.toISOString(),
          per_page: 100,
        },
      }
    );

    return data.map((c: { sha: string; commit: { message: string; author: { date: string } } }) => ({
      sha: c.sha,
      message: c.commit.message.split("\n")[0], // first line only
      date: c.commit.author.date,
    }));
  } catch {
    return []; // repo might be empty or private
  }
};

// ─── Main sync function ──────────────────────────────────────
export const syncUserGitHub = async (
  userId: string,
  githubUsername: string
): Promise<void> => {
  console.log(`🔄 Syncing GitHub for ${githubUsername}`);

  try {
    const repos = await getUserRepos(githubUsername);

    const allCommits: {
      sha: string;
      repo: string;
      message: string;
      type: "code" | "trivial";
      date: string;
    }[] = [];

    // Fetch commits from each repo
    for (const repo of repos) {
      const commits = await getCommitsFromRepo(githubUsername, repo);
      for (const c of commits) {
        allCommits.push({
          sha: c.sha,
          repo,
          message: c.message,
          type: classifyCommit(c.message),
          date: c.date,
        });
      }
    }

    const codeCommits = allCommits.filter((c) => c.type === "code").length;
    const trivialCommits = allCommits.filter((c) => c.type === "trivial").length;

    // Save CommitLog to MongoDB
    await CommitLog.create({
      user_id: userId,
      synced_at: new Date(),
      commits: allCommits,
    });

    // Update github_stats in Postgres (upsert)
    await supabase.from("github_stats").upsert({
      user_id: userId,
      total_commits: allCommits.length,
      code_commits: codeCommits,
      trivial_commits: trivialCommits,
      repos_contributed: repos.length,
      last_synced: new Date().toISOString(),
    });

    console.log(
      `✅ GitHub sync complete for ${githubUsername}: ${codeCommits} code, ${trivialCommits} trivial`
    );
  } catch (err) {
    console.error(`❌ GitHub sync failed for ${githubUsername}:`, err);
    throw err;
  }
};