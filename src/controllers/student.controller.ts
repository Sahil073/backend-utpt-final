import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { supabase } from "../config/db";
import { redis } from "../config/db";
import { uploadToCloudinary } from "../services/cloudinary.service";
import { syncUserGitHub } from "../services/github.service";
import { syncUserCoding } from "../services/coding.service";
import { DailySolveLog } from "../models/DailySolveLog.model";
import { invalidateUserCache } from "../utils/cache.utils";
// ────────────────────────────────────────────────────────────
// GET /students/me
// ────────────────────────────────────────────────────────────
export const getMyProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    // Try Redis cache first (separate key from stats cache)
    const cached = await redis.get(`user:profile:${userId}`);
    if (cached) {
      res.status(200).json({
        success: true,
        data: JSON.parse(cached),
        message: "Profile fetched (cached)",
      });
      return;
    }

    const { data: user, error } = await supabase
      .from("users")
      .select(`
        id, name, email, college_id, username, avatar_url,
        batch, specialization, roll_number, role, gender,
        github_username, leetcode_username, codeforces_username,
        tenth_percentage, twelfth_percentage, cpi,
        is_active, is_verified, created_at
      `)
      .eq("id", userId)
      .single();

    if (error || !user) {
      res.status(404).json({ success: false, data: null, message: "User not found" });
      return;
    }

    // Cache for 10 minutes (separate key from stats cache)
    await redis.set(`user:profile:${userId}`, JSON.stringify(user), "EX", 600);

    res.status(200).json({ success: true, data: user, message: "Profile fetched" });
  } catch (err) {
    console.error("getMyProfile error:", err);
    res.status(500).json({ success: false, data: null, message: "Internal server error" });
  }
};

// ────────────────────────────────────────────────────────────
// PUT /students/me
// Body: { github_username, leetcode_username, codeforces_username, batch, specialization }
// Platform usernames are ONE-TIME editable: once set they cannot be changed.
// ────────────────────────────────────────────────────────────
export const updateMyProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    // Fetch current values to enforce one-time lock on platform usernames
    const { data: currentUser, error: fetchError } = await supabase
      .from("users")
      .select("github_username, leetcode_username, codeforces_username")
      .eq("id", userId)
      .single();

    if (fetchError || !currentUser) {
      res.status(404).json({ success: false, data: null, message: "User not found" });
      return;
    }

    const updates: Record<string, string> = {};
    const lockedFields: string[] = [];

    // Platform usernames: only allow setting if currently null/empty
    const platformFields = [
      "github_username",
      "leetcode_username",
      "codeforces_username",
    ] as const;

    for (const key of platformFields) {
      if (req.body[key] !== undefined && req.body[key] !== "") {
        if (currentUser[key]) {
          lockedFields.push(key);
        } else {
          updates[key] = req.body[key];
        }
      }
    }

    // batch and specialization are always editable
    if (req.body.batch !== undefined) updates.batch = req.body.batch;
    if (req.body.specialization !== undefined) updates.specialization = req.body.specialization;

    if (Object.keys(updates).length === 0) {
      if (lockedFields.length > 0) {
        res.status(400).json({
          success: false,
          data: { locked_fields: lockedFields },
          message: "Platform usernames cannot be changed once set. Contact your admin to update.",
        });
      } else {
        res.status(400).json({ success: false, data: null, message: "No valid fields to update" });
      }
      return;
    }

    updates.updated_at = new Date().toISOString();

    const { data: user, error } = await supabase
      .from("users")
      .update(updates)
      .eq("id", userId)
      .select("id, name, github_username, leetcode_username, codeforces_username, batch, specialization")
      .single();

    if (error || !user) {
      res.status(500).json({ success: false, data: null, message: "Update failed" });
      return;
    }

    await invalidateUserCache(userId);

    res.status(200).json({
      success: true,
      data: { ...user, locked_fields: lockedFields },
      message: lockedFields.length > 0
        ? `Profile updated. Note: ${lockedFields.join(", ")} already set and cannot be changed.`
        : "Profile updated",
    });
  } catch (err) {
    console.error("updateMyProfile error:", err);
    res.status(500).json({ success: false, data: null, message: "Internal server error" });
  }
};

// ────────────────────────────────────────────────────────────
// PUT /students/me/password
// Body: { currentPassword, newPassword }
// ────────────────────────────────────────────────────────────
export const changePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      res.status(400).json({ success: false, data: null, message: "currentPassword and newPassword are required" });
      return;
    }

    if (newPassword.length < 8) {
      res.status(400).json({ success: false, data: null, message: "New password must be at least 8 characters" });
      return;
    }

    const { data: user, error } = await supabase
      .from("users")
      .select("password_hash")
      .eq("id", userId)
      .single();

    if (error || !user) {
      res.status(404).json({ success: false, data: null, message: "User not found" });
      return;
    }

    const isValid = await bcrypt.compare(currentPassword, user.password_hash || "");
    if (!isValid) {
      res.status(401).json({ success: false, data: null, message: "Current password is incorrect" });
      return;
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    await supabase
      .from("users")
      .update({
        password_hash: newHash,
        force_password_change: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    res.status(200).json({ success: true, data: null, message: "Password changed successfully" });
  } catch (err) {
    console.error("changePassword error:", err);
    res.status(500).json({ success: false, data: null, message: "Internal server error" });
  }
};

// ────────────────────────────────────────────────────────────
// POST /students/me/avatar
// Form-data: avatar (image file)
// ────────────────────────────────────────────────────────────
export const uploadAvatar = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    if (!req.file) {
      res.status(400).json({ success: false, data: null, message: "No file uploaded" });
      return;
    }

    // Upload to Cloudinary under utpt/avatars folder
    const avatarUrl = await uploadToCloudinary(
      req.file.buffer,
      "utpt/avatars",
      `avatar_${userId}`,
      "image"
    );

    // Update user record
    await supabase
      .from("users")
      .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
      .eq("id", userId);

    // Invalidate cache
    await invalidateUserCache(userId);

    res.status(200).json({
      success: true,
      data: { avatar_url: avatarUrl },
      message: "Avatar uploaded successfully",
    });
  } catch (err) {
    console.error("uploadAvatar error:", err);
    res.status(500).json({ success: false, data: null, message: "Internal server error" });
  }
};

// ────────────────────────────────────────────────────────────
// GET /students/me/stats
// ────────────────────────────────────────────────────────────
export const getMyStats = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId   = req.user!.id;
    const cacheKey = `user:stats:${userId}`;

    // Check Redis cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      res.status(200).json({
        success: true,
        data:    JSON.parse(cached),
        message: "Stats fetched (cached)",
      });
      return;
    }

    // Cache miss — fetch from Postgres
    const [codingRes, githubRes, scoreRes, userRes] = await Promise.all([
      supabase.from("coding_stats").select("*").eq("user_id", userId).single(),
      supabase.from("github_stats").select("*").eq("user_id", userId).single(),
      supabase.from("scores").select("*").eq("user_id", userId).single(),
      supabase.from("users").select("leetcode_username, codeforces_username, github_username").eq("id", userId).single(),
    ]);

    const raw_coding = codingRes.data;
    const raw_github = githubRes.data;
    const userProfile = userRes.data;

    // Map raw DB column names to what the frontend expects
    const data = {
      coding: raw_coding ? {
        leetcode_solved:       raw_coding.lc_total_solved  ?? 0,
        leetcode_rating:       raw_coding.lc_rating        ?? null,
        codeforces_rating:     raw_coding.cf_rating        ?? 0,
        codeforces_max_rating: raw_coding.cf_max_rating    ?? null,
        codeforces_solved:     raw_coding.cf_solved        ?? 0,
        leetcode_username:     userProfile?.leetcode_username   || null,
        codeforces_username:   userProfile?.codeforces_username || null,
      } : {
        leetcode_solved: 0, leetcode_rating: null,
        codeforces_rating: 0, codeforces_max_rating: null, codeforces_solved: 0,
        leetcode_username: userProfile?.leetcode_username   || null,
        codeforces_username: userProfile?.codeforces_username || null,
      },
      github: raw_github ? {
        total_commits:  raw_github.total_commits      ?? 0,
        public_repos:   raw_github.repos_contributed  ?? 0,
        followers:      raw_github.followers          ?? 0,
        streak_days:    raw_github.streak_days        ?? 0,
        github_username: userProfile?.github_username  || null,
      } : {
        total_commits: 0, public_repos: 0, followers: 0, streak_days: 0,
        github_username: userProfile?.github_username || null,
      },
      score: scoreRes.data || null,
    };

    // Write to Redis — 10 min TTL
    await redis.set(cacheKey, JSON.stringify(data), "EX", 10 * 60);

    res.status(200).json({
      success: true,
      data,
      message: "Stats fetched",
    });
  } catch (err) {
    console.error("getMyStats error:", err);
    res.status(500).json({ success: false, data: null, message: "Internal server error" });
  }
};
// ────────────────────────────────────────────────────────────
// GET /students/:id  — public profile
// ────────────────────────────────────────────────────────────
export const getStudentById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const { data: user, error } = await supabase
      .from("users")
      .select(`
        id, name, username, avatar_url, batch,
        specialization, github_username, leetcode_username,
        codeforces_username, created_at
      `)
      .eq("id", id)
      .eq("is_active", true)
      .single();

    if (error || !user) {
      res.status(404).json({ success: false, data: null, message: "Student not found" });
      return;
    }

    res.status(200).json({ success: true, data: user, message: "Student profile fetched" });
  } catch (err) {
    console.error("getStudentById error:", err);
    res.status(500).json({ success: false, data: null, message: "Internal server error" });
  }
};

// ────────────────────────────────────────────────────────────
// GET /students — search (trainer+ only)
// Query: ?batch=2022-26&specialization=CSE&name=sahil&page=1
// ────────────────────────────────────────────────────────────
export const searchStudents = async (req: Request, res: Response): Promise<void> => {
  try {
    const { batch, specialization, name, page = "1" } = req.query;
    const limit = 20;
    const offset = (parseInt(page as string) - 1) * limit;

    let query = supabase
      .from("users")
      .select("id, name, username, email, batch, specialization, avatar_url, is_active", { count: "exact" })
      .eq("role", "student")
      .range(offset, offset + limit - 1);

    if (batch) query = query.eq("batch", batch);
    if (specialization) query = query.eq("specialization", specialization);
    if (name) query = query.ilike("name", `%${name}%`);

    const { data, error, count } = await query;

    if (error) {
      res.status(500).json({ success: false, data: null, message: "Search failed" });
      return;
    }

    res.status(200).json({
      success: true,
      data: { students: data, total: count, page: parseInt(page as string) },
      message: "Students fetched",
    });
  } catch (err) {
    console.error("searchStudents error:", err);
    res.status(500).json({ success: false, data: null, message: "Internal server error" });
  }
};
// ────────────────────────────────────────────────────────────
// POST /students/me/sync/github
// ────────────────────────────────────────────────────────────
export const triggerGitHubSync = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    // Check cooldown (1 hour)
    const cooldownKey = `sync:github:${userId}`;
    const onCooldown = await redis.get(cooldownKey);
    if (onCooldown) {
      res.status(429).json({
        success: false,
        data: null,
        message: "GitHub sync is on cooldown. Try again in 1 hour.",
      });
      return;
    }

    // Get github username
    const { data: user } = await supabase
      .from("users")
      .select("github_username")
      .eq("id", userId)
      .single();

    if (!user?.github_username) {
      res.status(400).json({
        success: false,
        data: null,
        message: "No GitHub username set. Update your profile first.",
      });
      return;
    }

    // Set cooldown immediately
    await redis.set(cooldownKey, "1", "EX", 60 * 60); // 1 hour

    // Run async — don't await, return 202 immediately
    syncUserGitHub(userId, user.github_username).then(async () => {
      // Invalidate stats cache after sync
      await invalidateUserCache(userId);

      // Emit socket event
      const io = req.app.get("io");
      io.to(`user:${userId}`).emit("sync:complete", { type: "github" });
    }).catch(console.error);

    res.status(202).json({
      success: true,
      data: null,
      message: "GitHub sync started. Check back in a moment.",
    });
  } catch (err) {
    console.error("triggerGitHubSync error:", err);
    res.status(500).json({ success: false, data: null, message: "Internal server error" });
  }
};

// ────────────────────────────────────────────────────────────
// POST /students/me/sync/coding
// ────────────────────────────────────────────────────────────
export const triggerCodingSync = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user!.id;

    // Check 5-min cooldown
    const cooldownKey = `sync:cooldown:${userId}`;
    const onCooldown  = await redis.get(cooldownKey);
    if (onCooldown) {
      res.status(429).json({
        success: false,
        data:    null,
        message: "Sync is on cooldown. Try again in 5 minutes.",
      });
      return;
    }

    // Fetch usernames
    const { data: user } = await supabase
      .from("users")
      .select("leetcode_username, codeforces_username")
      .eq("id", userId)
      .single();

    if (!user?.leetcode_username && !user?.codeforces_username) {
      res.status(400).json({
        success: false,
        data:    null,
        message: "No LeetCode or Codeforces username set. Update your profile first.",
      });
      return;
    }

    // Set 5-min cooldown
    await redis.set(cooldownKey, "1", "EX", 5 * 60);

    // Async — return immediately
    syncUserCoding(
      userId,
      user.leetcode_username,
      user.codeforces_username
    ).then(async () => {
      await invalidateUserCache(userId);
      const io = req.app.get("io");
      io.to(`user:${userId}`).emit("sync:complete", { type: "coding" });
    }).catch(console.error);

    res.status(202).json({
      success: true,
      data:    null,
      message: "Coding sync started. Check back in a moment.",
    });
  } catch (err) {
    console.error("triggerCodingSync error:", err);
    res.status(500).json({ success: false, data: null, message: "Internal server error" });
  }
};

// ────────────────────────────────────────────────────────────
// GET /students/me/history
// 30-day daily solve history from MongoDB
// ────────────────────────────────────────────────────────────
export const getMySolveHistory = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user!.id;

    // Get last 30 days
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const sinceStr = since.toISOString().slice(0, 10);

    const logs = await DailySolveLog.find({
      user_id: userId,
      date:    { $gte: sinceStr },
    })
      .sort({ date: -1 })
      .lean();

    res.status(200).json({
      success: true,
      data:    logs,
      message: "Solve history fetched",
    });
  } catch (err) {
    console.error("getMySolveHistory error:", err);
    res.status(500).json({ success: false, data: null, message: "Internal server error" });
  }
};