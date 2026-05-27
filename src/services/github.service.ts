import axios, { AxiosInstance } from "axios";
import { ENV } from "../config/env";
import { supabase } from "../config/db";
import { CommitLog } from "../models/CommitLog.model";

// ─── GitHub API client ───────────────────────────────────────
// Built lazily so missing-token errors surface clearly at call time
let _githubAPI: AxiosInstance | null = null;

const getGithubAPI = (): AxiosInstance => {
  if (!_githubAPI) {
    if (!ENV.GITHUB_TOKEN) {
      throw new Error(
        "GITHUB_TOKEN is not set. GitHub sync is disabled. " +
        "Add a personal access token to your environment variables."
      );
    }
    _githubAPI = axios.create({
      baseURL: "https://api.github.com",
      headers: {
        Authorization: `Bearer ${ENV.GITHUB_TOKEN}`,
        Accept:        "application/vnd.github.v3+json",
      },
      timeout: 15000,
    });
  }
  return _githubAPI;
};

// ─── Commit classifier ───────────────────────────────────────
const TRIVIAL_PATTERNS = [
  /^fix typo/i,
  /^update readme/i,
  /^formatting/i,
  /^whitespace/i,
  /^merge (branch|pull request)/i,
  /^initial commit/i,
  /^add \.gitignore/i,
  /^bump version/i,
  /^\bwip\b/i,
  /^minor fix/i,
  /^cleanup/i,
  /^chore/i,
];

const classifyCommit = (message: string): "code" | "trivial" =>
  TRIVIAL_PATTERNS.some((p) => p.test(message)) ? "trivial" : "code";

// ─── Fetch user repos (max 100, public only) ─────────────────
const getUserRepos = async (username: string): Promise<string[]> => {
  const api = getGithubAPI();
  try {
    const { data } = await api.get(`/users/${username}/repos`, {
      params: { per_page: 100, sort: "pushed", type: "owner" },
    });
    return (data as { name: string; fork: boolean }[])
      .filter((r) => !r.fork) // exclude forks — they inflate commit counts
      .map((r) => r.name);
  } catch (err: any) {
    if (err?.response?.status === 404) {
      throw new Error(`GitHub user "${username}" not found.`);
    }
    throw err;
  }
};

// ─── Fetch commits from one repo (last 30 days) ──────────────
const getCommitsFromRepo = async (
  username: string,
  repo:     string
): Promise<{ sha: string; message: string; date: string }[]> => {
  const api = getGithubAPI();
  try {
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const { data } = await api.get(`/repos/${username}/${repo}/commits`, {
      params: {
        author:   username,
        since:    since.toISOString(),
        per_page: 100,
      },
    });

    return (
      data as { sha: string; commit: { message: string; author: { date: string } } }[]
    ).map((c) => ({
      sha:     c.sha,
      message: c.commit.message.split("\n")[0], // first line only
      date:    c.commit.author.date,
    }));
  } catch {
    return []; // empty / private / inaccessible repo — skip silently
  }
};

// ─── Main sync function ──────────────────────────────────────
export const syncUserGitHub = async (
  userId:         string,
  githubUsername: string
): Promise<void> => {
  console.log(`🔄 Syncing GitHub for ${githubUsername}`);

  const api = getGithubAPI(); // throws clearly if token missing

  // Verify the user exists on GitHub before doing anything else
  try {
    await api.get(`/users/${githubUsername}`);
  } catch (err: any) {
    if (err?.response?.status === 404) {
      throw new Error(`GitHub user "${githubUsername}" does not exist.`);
    }
    throw err;
  }

  const repos = await getUserRepos(githubUsername);

  // Deduplicate commits by SHA across all repos (same commit can appear
  // in multiple repos if the user has mirrored repos)
  const seenShas = new Set<string>();
  const allCommits: {
    sha:     string;
    repo:    string;
    message: string;
    type:    "code" | "trivial";
    date:    string;
  }[] = [];

  for (const repo of repos) {
    const commits = await getCommitsFromRepo(githubUsername, repo);
    for (const c of commits) {
      if (seenShas.has(c.sha)) continue; // deduplicate
      seenShas.add(c.sha);
      allCommits.push({
        sha:     c.sha,
        repo,
        message: c.message,
        type:    classifyCommit(c.message),
        date:    c.date,
      });
    }
  }

  const codeCommits    = allCommits.filter((c) => c.type === "code").length;
  const trivialCommits = allCommits.filter((c) => c.type === "trivial").length;

  // Persist CommitLog to MongoDB (append new sync snapshot)
  await CommitLog.create({
    user_id:   userId,
    synced_at: new Date(),
    commits:   allCommits,
  });

  // Upsert summary row into Postgres
  const { error } = await supabase.from("github_stats").upsert(
    {
      user_id:            userId,
      total_commits:      allCommits.length,
      code_commits:       codeCommits,
      trivial_commits:    trivialCommits,
      repos_contributed:  repos.length,
      last_synced:        new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) {
    console.error(`❌ github_stats upsert failed for ${userId}:`, error.message);
    throw error;
  }

  console.log(
    `✅ GitHub sync complete for ${githubUsername}: ` +
    `${codeCommits} code commits, ${trivialCommits} trivial, across ${repos.length} repos`
  );
};