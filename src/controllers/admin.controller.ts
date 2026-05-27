import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { supabase } from "../config/db";
import { DailySolveLog } from "../models/DailySolveLog.model";
import { sendToUser, sendToBatch, sendToAll } from "../services/notification.service";
import * as XLSX from "xlsx";
import { parse as csvParse } from "csv-parse/sync";
import { syncUserCoding } from "../services/coding.service";
import { syncUserGitHub } from "../services/github.service";
import { computeScore } from "../services/scoring.service";

// ────────────────────────────────────────────────────────────
// FIELD GLOSSARY (for developers):
//
//   top_label  = 1 → student has PORTAL ACCESS (can log in)
//   top_label  = 0 → analytics-only (tracked, cannot log in)
//
//   is_active  = true  → account is ENABLED  (can log in)
//   is_active  = false → account is DISABLED  (login blocked / suspended)
//
//   is_verified = true → account setup complete (password changed at least once)
//
//   force_password_change = true → first-login flag; student must set a new
//                                  password before using the platform
//
// Import flow:
//   top_label=1 → creates a real portal account with a hashed initial
//                 password, is_active=true, force_password_change=true
//   top_label=0 → stores student data for analytics only; NO login possible
//
// "Disable" button → toggles is_active on a portal student (top_label=1).
//   Disabled students cannot log in but their data is retained.
//   This does NOT remove portal access (top_label stays 1).
//
// Auto-sync on import:
//   After a portal student is inserted/updated the system immediately
//   fires a background sync for LeetCode, Codeforces, and GitHub so
//   the student appears on the leaderboard with real data right away.
// ────────────────────────────────────────────────────────────

// ────────────────────────────────────────────────────────────
// GET /admin/dashboard
// ────────────────────────────────────────────────────────────
export const getDashboard = async (req: Request, res: Response): Promise<void> => {
  try {
    const { count: totalPortal } = await supabase
      .from("users")
      .select("*", { count: "exact", head: true })
      .eq("role", "student")
      .eq("top_label", 1);

    const { count: totalAnalytics } = await supabase
      .from("users")
      .select("*", { count: "exact", head: true })
      .eq("role", "student")
      .eq("top_label", 0);

    const { data: scoreData } = await supabase
      .from("scores")
      .select("total_score");

    const avgScore =
      scoreData && scoreData.length > 0
        ? Math.round(
            scoreData.reduce((sum, s) => sum + (s.total_score || 0), 0) /
              scoreData.length
          )
        : 0;

    const today = new Date().toISOString().slice(0, 10);
    const activeToday = await DailySolveLog.countDocuments({
      date: today,
      total_solved: { $gt: 0 },
    });

    const { data: topScorerData } = await supabase
      .from("scores")
      .select("user_id, total_score")
      .order("total_score", { ascending: false })
      .limit(1)
      .single();

    let topScorer = null;
    if (topScorerData) {
      const { data: topUser } = await supabase
        .from("users")
        .select("name, username, college_id")
        .eq("id", topScorerData.user_id)
        .single();
      topScorer = { ...topScorerData, name: topUser?.name, username: topUser?.username };
    }

    res.status(200).json({
      success: true,
      data: {
        total_students:  (totalPortal ?? 0) + (totalAnalytics ?? 0),
        portal_students: totalPortal    ?? 0,
        analytics_only:  totalAnalytics ?? 0,
        active_today:    activeToday,
        avg_score:       avgScore,
        top_scorer:      topScorer,
      },
      message: "Dashboard stats fetched",
    });
  } catch (err) {
    console.error("getDashboard error:", err);
    res.status(500).json({ success: false, data: null, message: "Internal server error" });
  }
};

// ────────────────────────────────────────────────────────────
// GET /admin/students
// ────────────────────────────────────────────────────────────
export const getAllStudents = async (req: Request, res: Response): Promise<void> => {
  try {
    const { batch, specialization, name, page = "1", top_label } = req.query;
    const limit  = 20;
    const offset = (parseInt(page as string) - 1) * limit;

    let query = supabase
      .from("users")
      .select(
        "id, name, username, email, college_id, batch, specialization, avatar_url, is_active, top_label, gender, cpi, tenth_percentage, twelfth_percentage, created_at",
        { count: "exact" }
      )
      .eq("role", "student")
      .range(offset, offset + limit - 1)
      .order("created_at", { ascending: false });

    if (batch)        query = query.eq("batch", batch);
    if (specialization) query = query.eq("specialization", specialization);
    if (name)         query = query.ilike("name", `%${name}%`);
    if (top_label !== undefined)
      query = query.eq("top_label", parseInt(top_label as string));

    const { data: students, error, count } = await query;

    if (error) {
      res.status(500).json({ success: false, data: null, message: error.message });
      return;
    }

    const studentIds = (students || []).map((s) => s.id);
    let scoresMap: Record<string, number> = {};
    if (studentIds.length > 0) {
      const { data: scores } = await supabase
        .from("scores")
        .select("user_id, total_score")
        .in("user_id", studentIds);
      (scores || []).forEach((s) => { scoresMap[s.user_id] = s.total_score; });
    }

    const enriched = (students || []).map((s) => ({
      ...s,
      total_score:       scoresMap[s.id] ?? 0,
      has_portal_access: s.top_label === 1,
      account_status:    s.is_active ? "active" : "disabled",
    }));

    res.status(200).json({
      success: true,
      data: enriched,
      pagination: { total: count, page: parseInt(page as string), limit },
      message: "Students fetched",
    });
  } catch (err) {
    console.error("getAllStudents error:", err);
    res.status(500).json({ success: false, data: null, message: "Internal server error" });
  }
};

// ────────────────────────────────────────────────────────────
// GET /admin/students/:id/detail
// ────────────────────────────────────────────────────────────
export const getStudentDetail = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const [userRes, codingRes, githubRes, scoreRes] = await Promise.all([
      supabase.from("users").select("*").eq("id", id).single(),
      supabase.from("coding_stats").select("*").eq("user_id", id).single(),
      supabase.from("github_stats").select("*").eq("user_id", id).single(),
      supabase.from("scores").select("*").eq("user_id", id).single(),
    ]);

    if (!userRes.data) {
      res.status(404).json({ success: false, data: null, message: "Student not found" });
      return;
    }

    const since = new Date();
    since.setDate(since.getDate() - 30);
    const sinceStr = since.toISOString().slice(0, 10);

    const history = await DailySolveLog.find({ user_id: id, date: { $gte: sinceStr } })
      .sort({ date: -1 })
      .lean();

    const profile = userRes.data;
    const coding  = codingRes.data;
    const github  = githubRes.data;
    const score   = scoreRes.data;

    res.status(200).json({
      success: true,
      data: {
        profile: {
          ...profile,
          has_portal_access: profile.top_label === 1,
          account_status:    profile.is_active ? "active" : "disabled",
        },
        stats: {
          academics: {
            tenth_percentage:   profile.tenth_percentage   ?? null,
            twelfth_percentage: profile.twelfth_percentage ?? null,
            cpi:                profile.cpi                ?? null,
          },
          coding: {
            leetcode_solved:     coding?.lc_total_solved  ?? 0,
            codeforces_rating:   coding?.cf_rating        ?? 0,
            codeforces_solved:   coding?.cf_solved        ?? 0,
            leetcode_username:   profile.leetcode_username,
            codeforces_username: profile.codeforces_username,
          },
          github: {
            total_commits: github?.total_commits     ?? 0,
            code_commits:  github?.code_commits      ?? 0,
            public_repos:  github?.repos_contributed ?? 0,
          },
          score: {
            total_score:     score?.total_score     ?? 0,
            academics_score: score?.academics_score ?? 0,
            coding_score:    score?.coding_score    ?? 0,
            dev_score:       score?.dev_score       ?? 0,
            rank:            score?.rank            ?? null,
          },
        },
        history,
      },
      message: "Student detail fetched",
    });
  } catch (err) {
    console.error("getStudentDetail error:", err);
    res.status(500).json({ success: false, data: null, message: "Internal server error" });
  }
};

// ────────────────────────────────────────────────────────────
// GET /admin/poor-performers
// ────────────────────────────────────────────────────────────
export const getPoorPerformers = async (req: Request, res: Response): Promise<void> => {
  try {
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const sinceStr = since.toISOString().slice(0, 10);

    const { data: students } = await supabase
      .from("users")
      .select("id, name, username, email, college_id, batch, specialization, avatar_url")
      .eq("role", "student")
      .eq("is_active", true)
      .eq("top_label", 1);

    if (!students || students.length === 0) {
      res.status(200).json({ success: true, data: [], message: "No students found" });
      return;
    }

    const activeLogs = await DailySolveLog.distinct("user_id", {
      date:         { $gte: sinceStr },
      total_solved: { $gt: 0 },
    });

    const activeSet     = new Set(activeLogs);
    const poorPerformers = students.filter((s) => !activeSet.has(s.id));

    const enriched = await Promise.all(
      poorPerformers.map(async (s) => {
        const lastLog = await DailySolveLog.findOne({ user_id: s.id, total_solved: { $gt: 0 } })
          .sort({ date: -1 })
          .lean();
        return { ...s, last_active: lastLog?.date || null };
      })
    );

    res.status(200).json({ success: true, data: enriched, message: "Poor performers fetched" });
  } catch (err) {
    console.error("getPoorPerformers error:", err);
    res.status(500).json({ success: false, data: null, message: "Internal server error" });
  }
};

// ────────────────────────────────────────────────────────────
// GET /admin/top-performers
// ────────────────────────────────────────────────────────────
export const getTopPerformers = async (req: Request, res: Response): Promise<void> => {
  try {
    const { data: topScores } = await supabase
      .from("scores")
      .select("user_id, total_score, rank, academics_score, coding_score, dev_score")
      .order("total_score", { ascending: false })
      .limit(10);

    const topIds     = (topScores || []).map((s) => s.user_id);
    let topUsers: Record<string, any> = {};

    if (topIds.length > 0) {
      const { data: users } = await supabase
        .from("users")
        .select("id, name, username, avatar_url, batch, specialization")
        .in("id", topIds);
      (users || []).forEach((u) => { topUsers[u.id] = u; });
    }

    const globalTop = (topScores || []).map((s) => ({
      ...topUsers[s.user_id],
      total_score:     s.total_score,
      academics_score: s.academics_score,
      coding_score:    s.coding_score,
      dev_score:       s.dev_score,
      rank:            s.rank,
    }));

    res.status(200).json({
      success: true,
      data: { global: globalTop, top_global: globalTop },
      message: "Top performers fetched",
    });
  } catch (err) {
    console.error("getTopPerformers error:", err);
    res.status(500).json({ success: false, data: null, message: "Internal server error" });
  }
};

// ────────────────────────────────────────────────────────────
// GET /admin/leaderboard
// ────────────────────────────────────────────────────────────
export const getFullLeaderboard = async (req: Request, res: Response): Promise<void> => {
  try {
    const { data: scores, error } = await supabase
      .from("scores")
      .select("user_id, total_score, coding_score, dev_score, academics_score, rank")
      .order("total_score", { ascending: false });

    if (error) {
      res.status(500).json({ success: false, data: null, message: error.message });
      return;
    }

    const ids = (scores || []).map((s) => s.user_id);
    let usersMap: Record<string, any> = {};
    if (ids.length > 0) {
      const { data: users } = await supabase
        .from("users")
        .select("id, name, username, avatar_url, batch, specialization")
        .in("id", ids);
      (users || []).forEach((u) => { usersMap[u.id] = u; });
    }

    const data = (scores || []).map((s) => ({ ...usersMap[s.user_id], ...s }));
    res.status(200).json({ success: true, data, message: "Full leaderboard fetched" });
  } catch (err) {
    console.error("getFullLeaderboard error:", err);
    res.status(500).json({ success: false, data: null, message: "Internal server error" });
  }
};

// ────────────────────────────────────────────────────────────
// POST /admin/notify/send
// ────────────────────────────────────────────────────────────
export const sendAdminNotification = async (req: Request, res: Response): Promise<void> => {
  try {
    const { title, body, type, target, batch, userId } = req.body;
    const io = req.app.get("io");

    if (!title || !body || !target) {
      res.status(400).json({ success: false, data: null, message: "title, body, and target are required" });
      return;
    }

    const opts = {
      title,
      body,
      notifType:  type || "announcement",
      sendEmail:  true,
      sendPush:   true,
      io,
    };

    if      (target === "all")               sendToAll(opts).catch(console.error);
    else if (target === "batch"  && batch)   sendToBatch(batch, opts).catch(console.error);
    else if (target === "user"   && userId)  sendToUser(userId, opts).catch(console.error);
    else {
      res.status(400).json({ success: false, data: null, message: "Invalid target. Use all | batch (with batch) | user (with userId)" });
      return;
    }

    res.status(202).json({ success: true, data: null, message: `Notification queued for target: ${target}` });
  } catch (err) {
    console.error("sendAdminNotification error:", err);
    res.status(500).json({ success: false, data: null, message: "Internal server error" });
  }
};

// ────────────────────────────────────────────────────────────
// Student row type for import
// ────────────────────────────────────────────────────────────
type StudentRow = {
  name:                string;
  college_id:          string;
  email:               string;
  batch:               string;
  specialization?:     string;
  roll_number?:        string;
  leetcode_username?:  string;
  github_username?:    string;
  codeforces_username?: string;
  tenth_percentage?:   number;
  twelfth_percentage?: number;
  cpi?:                number;
  gender?:             string;
  top_label:           number; // 1 = portal access, 0 = analytics only
  father_number?:      string;
};

// ────────────────────────────────────────────────────────────
// Flexible column-name normaliser for CSV / Excel rows
// ────────────────────────────────────────────────────────────
function normalizeRow(raw: Record<string, any>): StudentRow {
  const get = (...keys: string[]): string => {
    for (const k of keys) {
      const normalizedKey = k.toLowerCase().replace(/[\s_\-]/g, "");
      const found = Object.keys(raw).find(
        (rk) => rk.trim().toLowerCase().replace(/[\s_\-]/g, "") === normalizedKey
      );
      if (found && String(raw[found] ?? "").trim())
        return String(raw[found]).trim();
    }
    return "";
  };

  const topLabelRaw = get("toplabel", "top_label", "label", "portal", "portalaccess", "hasportal");
  const topLabel =
    topLabelRaw === "1" ||
    topLabelRaw.toLowerCase() === "yes"    ||
    topLabelRaw.toLowerCase() === "true"   ||
    topLabelRaw.toLowerCase() === "portal"
      ? 1 : 0;

  const tenthRaw   = get("tenth", "tenth_percentage", "10th", "10thpercent", "tenthpercent", "10thpercentage");
  const twelfthRaw = get("twelfth", "twelfth_percentage", "12th", "12thpercent", "twelfthpercent", "12thpercentage");
  const cpiRaw     = get("cpi", "cgpa", "gpa", "sgpa");

  return {
    name:                get("name", "fullname", "studentname", "student_name"),
    college_id:          get("collegeid", "college_id", "enrollment", "enrollmentno", "enrollmentnumber", "id", "studentid"),
    email:               get("email", "emailid", "collegemail", "email_id", "college_email"),
    batch:               get("batch", "year", "batchyear", "batch_year"),
    specialization:      get("specialization", "spec", "branch", "department", "dept") || undefined,
    roll_number:         get("rollnumber", "roll_number", "rollno", "roll", "roll_no") || undefined,
    leetcode_username:   get("leetcodeusername", "leetcode_username", "leetcode", "lc", "lc_username") || undefined,
    github_username:     get("githubusername", "github_username", "github", "gh", "gh_username") || undefined,
    codeforces_username: get("codeforcesusername", "codeforces_username", "codeforces", "cf", "cfhandle", "cf_handle") || undefined,
    tenth_percentage:    tenthRaw   ? parseFloat(tenthRaw)   : undefined,
    twelfth_percentage:  twelfthRaw ? parseFloat(twelfthRaw) : undefined,
    cpi:                 cpiRaw     ? parseFloat(cpiRaw)     : undefined,
    gender:              get("gender", "sex") || undefined,
    top_label:           topLabel,
    father_number:       get("fathernumber", "father_number", "fathermobile", "fatherphone", "fathercontact", "father_contact") || undefined,
  };
}

// ────────────────────────────────────────────────────────────
// Generate initial password for portal students
// Priority: father_number → roll_number@name(4) → college_id@utpt
// ────────────────────────────────────────────────────────────
function generateInitialPassword(s: StudentRow): string {
  if (s.father_number && s.father_number.length >= 6) return s.father_number;
  if (s.roll_number && s.name)
    return `${s.roll_number}@${s.name.substring(0, 4).toLowerCase()}`;
  if (s.roll_number) return `${s.roll_number}@utpt`;
  return `${s.college_id}@utpt`;
}

// ────────────────────────────────────────────────────────────
// Background auto-sync for a newly imported portal student
// Fires-and-forgets: does NOT block the HTTP response
// ────────────────────────────────────────────────────────────
async function triggerAutoSync(
  userId: string,
  s: StudentRow
): Promise<void> {
  console.log(`🚀 Auto-sync starting for new student ${userId}`);

  // 1. Coding (LeetCode + Codeforces)
  if (s.leetcode_username || s.codeforces_username) {
    try {
      await syncUserCoding(userId, s.leetcode_username ?? null, s.codeforces_username ?? null);
      console.log(`✅ Auto-sync coding done for ${userId}`);
    } catch (err) {
      console.error(`❌ Auto-sync coding failed for ${userId}:`, err);
    }
  }

  // 2. GitHub
  if (s.github_username) {
    try {
      await syncUserGitHub(userId, s.github_username);
      console.log(`✅ Auto-sync GitHub done for ${userId}`);
    } catch (err) {
      console.error(`❌ Auto-sync GitHub failed for ${userId}:`, err);
    }
  }

  // 3. Recompute and persist this student's score immediately
  try {
    const [codingRes, githubRes, userRes] = await Promise.all([
      supabase.from("coding_stats").select("*").eq("user_id", userId).single(),
      supabase.from("github_stats").select("*").eq("user_id", userId).single(),
      supabase.from("users").select("tenth_percentage, twelfth_percentage, cpi").eq("id", userId).single(),
    ]);

    const coding = codingRes.data  || {};
    const github = githubRes.data  || {};
    const user   = userRes.data    || {};

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

    console.log(`✅ Auto-sync score updated for ${userId}: ${totalScore}`);
  } catch (err) {
    console.error(`❌ Auto-sync score recompute failed for ${userId}:`, err);
  }
}

// ────────────────────────────────────────────────────────────
// Core import logic — used by both JSON and file endpoints
// ────────────────────────────────────────────────────────────
async function processStudentImport(students: StudentRow[]) {
  let portalCount    = 0;
  let analyticsCount = 0;
  const errors: string[] = [];

  for (const s of students) {
    try {
      const isPortal = s.top_label === 1;

      const record: Record<string, any> = {
        name:                s.name,
        college_id:          s.college_id,
        email:               s.email,
        batch:               s.batch,
        specialization:      s.specialization      || null,
        roll_number:         s.roll_number         || null,
        leetcode_username:   s.leetcode_username   || null,
        github_username:     s.github_username     || null,
        codeforces_username: s.codeforces_username || null,
        tenth_percentage:    s.tenth_percentage    ?? null,
        twelfth_percentage:  s.twelfth_percentage  ?? null,
        cpi:                 s.cpi                 ?? null,
        gender:              s.gender              || null,
        top_label:           s.top_label,
        role:                "student",
        // Portal → active + verified; analytics-only → inactive, not verified
        is_active:              isPortal,
        is_verified:            isPortal,
        force_password_change:  isPortal,
      };

      if (isPortal) {
        const rawPassword  = generateInitialPassword(s);
        record.password_hash = await bcrypt.hash(rawPassword, 12);
      }

      const { error: upsertError } = await supabase
        .from("users")
        .upsert(record, { onConflict: "college_id", ignoreDuplicates: false });

      if (upsertError) {
        errors.push(`${s.college_id}: ${upsertError.message}`);
        continue;
      }

      // Fetch the UUID Postgres assigned so we can use it for sub-tables
      const { data: newUser } = await supabase
        .from("users")
        .select("id")
        .eq("college_id", s.college_id)
        .single();

      if (!newUser?.id) {
        errors.push(`${s.college_id}: could not retrieve user id after upsert`);
        continue;
      }

      if (isPortal) {
        // Seed a zero-score row so the student appears on the leaderboard
        // immediately (will be overwritten when auto-sync completes)
        await supabase.from("scores").upsert(
          {
            user_id:         newUser.id,
            academics_score: 0,
            coding_score:    0,
            dev_score:       0,
            total_score:     0,
            last_computed:   new Date().toISOString(),
          },
          { onConflict: "user_id", ignoreDuplicates: false }
        );

        // Fire-and-forget: sync LeetCode + Codeforces + GitHub in background
        // so real data populates within seconds without blocking the response
        triggerAutoSync(newUser.id, s).catch((err) =>
          console.error(`Auto-sync uncaught error for ${newUser.id}:`, err)
        );

        portalCount++;
      } else {
        analyticsCount++;
      }
    } catch (err: any) {
      errors.push(`${s.college_id || "unknown"}: ${err.message}`);
    }
  }

  return {
    total:            students.length,
    portal_accounts:  portalCount,
    analytics_only:   analyticsCount,
    failed:           errors.length,
    errors:           errors.slice(0, 20),
    note:             portalCount > 0
      ? "LeetCode, Codeforces, and GitHub data is being synced in the background. Scores will update within a minute."
      : undefined,
  };
}

// ────────────────────────────────────────────────────────────
// POST /admin/import-students  (JSON body)
// Body: { students: StudentRow[] }
// ────────────────────────────────────────────────────────────
export const importStudents = async (req: Request, res: Response): Promise<void> => {
  try {
    const students: StudentRow[] = req.body.students;

    if (!Array.isArray(students) || students.length === 0) {
      res.status(400).json({ success: false, data: null, message: "students array is required" });
      return;
    }

    const result = await processStudentImport(students);

    res.status(200).json({
      success: true,
      data:    result,
      message: `${result.total} students processed — ${result.portal_accounts} portal accounts created, ${result.analytics_only} analytics-only, ${result.failed} failed`,
    });
  } catch (err) {
    console.error("importStudents error:", err);
    res.status(500).json({ success: false, data: null, message: "Internal server error" });
  }
};

// ────────────────────────────────────────────────────────────
// POST /admin/import-students/file  (CSV / Excel upload)
// ────────────────────────────────────────────────────────────
export const importStudentsFromFile = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, data: null, message: "No file uploaded. Please upload a CSV or Excel file." });
      return;
    }

    const ext = req.file.originalname.split(".").pop()?.toLowerCase();
    let rows: Record<string, any>[] = [];

    if (ext === "csv") {
      const text = req.file.buffer.toString("utf-8");
      rows = csvParse(text, { columns: true, skip_empty_lines: true, trim: true }) as Record<string, any>[];
    } else if (ext === "xlsx" || ext === "xls") {
      const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
      const sheet    = workbook.Sheets[workbook.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });
    } else {
      res.status(400).json({ success: false, data: null, message: "Unsupported file format. Use CSV or Excel (.xlsx/.xls)." });
      return;
    }

    if (!rows || rows.length === 0) {
      res.status(400).json({ success: false, data: null, message: "File is empty or could not be parsed." });
      return;
    }

    const students: StudentRow[] = rows.map(normalizeRow);

    // Validate required fields
    const validationErrors: string[] = [];
    students.forEach((s, i) => {
      const rowNum = i + 2; // +2 because row 1 is the header
      if (!s.name)       validationErrors.push(`Row ${rowNum}: missing name`);
      if (!s.college_id) validationErrors.push(`Row ${rowNum}: missing college_id / enrollment`);
      if (!s.email)      validationErrors.push(`Row ${rowNum}: missing email`);
      if (!s.batch)      validationErrors.push(`Row ${rowNum}: missing batch`);
    });

    if (validationErrors.length > 0) {
      res.status(400).json({
        success: false,
        data:    { errors: validationErrors.slice(0, 20) },
        message: `Validation failed for ${validationErrors.length} row(s). Fix and re-upload.`,
      });
      return;
    }

    const result = await processStudentImport(students);

    res.status(200).json({
      success: true,
      data:    { ...result, file: req.file.originalname },
      message: `${result.total} students imported from ${req.file.originalname} — ${result.portal_accounts} portal accounts, ${result.analytics_only} analytics-only, ${result.failed} failed`,
    });
  } catch (err) {
    console.error("importStudentsFromFile error:", err);
    res.status(500).json({ success: false, data: null, message: "Failed to parse or import file." });
  }
};

// ────────────────────────────────────────────────────────────
// PUT /admin/students/:id/toggle-active
//
// Enables or disables a portal student's login.
// - Only works on portal students (top_label = 1).
// - Disabled students keep their data; they simply cannot log in.
// - Does NOT change top_label.
// ────────────────────────────────────────────────────────────
export const toggleStudentActive = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const { data: user } = await supabase
      .from("users")
      .select("is_active, top_label, name")
      .eq("id", id)
      .single();

    if (!user) {
      res.status(404).json({ success: false, data: null, message: "Student not found" });
      return;
    }

    if (user.top_label !== 1) {
      res.status(400).json({
        success: false,
        data:    null,
        message: "This student has no portal access (analytics-only). Only portal students can be enabled/disabled.",
      });
      return;
    }

    const newActiveState = !user.is_active;

    const { data: updated } = await supabase
      .from("users")
      .update({ is_active: newActiveState })
      .eq("id", id)
      .select("id, name, is_active")
      .single();

    res.status(200).json({
      success: true,
      data:    updated,
      message: `Student "${user.name}" ${newActiveState ? "enabled — can now log in" : "disabled — login blocked"}`,
    });
  } catch (err) {
    console.error("toggleStudentActive error:", err);
    res.status(500).json({ success: false, data: null, message: "Internal server error" });
  }
};

// ────────────────────────────────────────────────────────────
// GET /admin/analytics/activity
// ────────────────────────────────────────────────────────────
export const getActivityAnalytics = async (req: Request, res: Response): Promise<void> => {
  try {
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const sinceStr = since.toISOString().slice(0, 10);

    const data = await DailySolveLog.aggregate([
      { $match: { date: { $gte: sinceStr }, total_solved: { $gt: 0 } } },
      {
        $group: {
          _id:         "$date",
          count:       { $sum: 1 },
          totalSolves: { $sum: "$total_solved" },
        },
      },
      { $sort: { _id: 1 } },
      { $project: { date: "$_id", count: 1, totalSolves: 1, _id: 0 } },
    ]);

    res.status(200).json({ success: true, data, message: "Activity analytics fetched" });
  } catch (err) {
    console.error("getActivityAnalytics error:", err);
    res.status(500).json({ success: false, data: null, message: "Internal server error" });
  }
};

// ────────────────────────────────────────────────────────────
// POST /admin/create-trainer
// ────────────────────────────────────────────────────────────
export const createTrainer = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, college_id, password } = req.body;

    if (!name || !email || !college_id || !password) {
      res.status(400).json({ success: false, data: null, message: "name, email, college_id, and password are required" });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ success: false, data: null, message: "Password must be at least 8 characters" });
      return;
    }

    const [emailCheck, cidCheck] = await Promise.all([
      supabase.from("users").select("id").eq("email", email).maybeSingle(),
      supabase.from("users").select("id").eq("college_id", college_id).maybeSingle(),
    ]);

    if (emailCheck.data || cidCheck.data) {
      res.status(409).json({ success: false, data: null, message: "Email or college_id already in use" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const { data: trainer, error } = await supabase
      .from("users")
      .insert({
        name,
        email,
        college_id,
        password_hash:         passwordHash,
        role:                  "trainer",
        is_active:             true,
        is_verified:           true,
        force_password_change: false,
        top_label:             1,
      })
      .select("id, name, email, college_id, role")
      .single();

    if (error || !trainer) {
      res.status(500).json({ success: false, data: null, message: error?.message || "Failed to create trainer" });
      return;
    }

    res.status(201).json({ success: true, data: trainer, message: "Trainer created successfully" });
  } catch (err) {
    console.error("createTrainer error:", err);
    res.status(500).json({ success: false, data: null, message: "Internal server error" });
  }
};

// ────────────────────────────────────────────────────────────
// GET /admin/students/search
// ────────────────────────────────────────────────────────────
export const searchStudentByEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const { q, email, name, college_id, batch } = req.query as Record<string, string>;

    if (!q && !email && !name && !college_id && !batch) {
      res.status(400).json({
        success: false,
        data:    null,
        message: "Provide at least one search parameter: q, email, name, college_id, or batch",
      });
      return;
    }

    let query = supabase
      .from("users")
      .select("id, name, username, email, college_id, batch, specialization, avatar_url, is_active, top_label, gender")
      .eq("role", "student")
      .limit(50);

    if (q) {
      const term = q.trim();
      query = query.or(
        `name.ilike.%${term}%,email.ilike.%${term}%,college_id.ilike.%${term}%,username.ilike.%${term}%`
      );
    } else {
      const orParts: string[] = [];
      if (name)       orParts.push(`name.ilike.%${name.trim()}%`);
      if (email)      orParts.push(`email.ilike.%${email.trim()}%`);
      if (college_id) orParts.push(`college_id.ilike.%${college_id.trim()}%`);
      if (orParts.length > 0) query = query.or(orParts.join(","));
      if (batch) query = query.eq("batch", batch.trim());
    }

    query = query.order("name", { ascending: true });

    const { data: students, error } = await query;

    if (error) {
      res.status(500).json({ success: false, data: null, message: error.message });
      return;
    }

    res.status(200).json({
      success: true,
      data: (students || []).map((s) => ({
        ...s,
        has_portal_access: s.top_label === 1,
        account_status:    s.is_active ? "active" : "disabled",
      })),
      message: `${(students || []).length} result(s) found`,
    });
  } catch (err) {
    console.error("searchStudents error:", err);
    res.status(500).json({ success: false, data: null, message: "Internal server error" });
  }
};

// ────────────────────────────────────────────────────────────
// GET /admin/analytics/batch?batch=2022-26
// ────────────────────────────────────────────────────────────
export const getBatchAnalytics = async (req: Request, res: Response): Promise<void> => {
  try {
    const batch = (req.query.batch as string)?.trim();
    if (!batch) {
      res.status(400).json({ success: false, data: null, message: "batch query param is required" });
      return;
    }

    const { data: students } = await supabase
      .from("users")
      .select("id, name, college_id, specialization, top_label")
      .eq("role", "student")
      .eq("batch", batch);

    if (!students || students.length === 0) {
      res.status(200).json({
        success: true,
        data: {
          batch, total_students: 0, portal_students: 0, analytics_only: 0,
          active_today: 0, avg_score: 0, avg_lc_solved: 0, avg_cf_rating: 0,
          score_distribution: {}, specialization_breakdown: [], top_performers: [],
        },
        message: `No students found in batch ${batch}`,
      });
      return;
    }

    const studentIds = students.map((s) => s.id);

    const [scoresRes, codingRes] = await Promise.all([
      supabase.from("scores").select("user_id, total_score, academics_score, coding_score, dev_score").in("user_id", studentIds),
      supabase.from("coding_stats").select("user_id, lc_total_solved, cf_rating").in("user_id", studentIds),
    ]);

    const today      = new Date().toISOString().slice(0, 10);
    const activeToday = await DailySolveLog.countDocuments({
      user_id:      { $in: studentIds },
      date:         today,
      total_solved: { $gt: 0 },
    });

    const scores = scoresRes.data || [];
    const coding = codingRes.data || [];

    let totalScore = 0;
    const distribution: Record<string, number> = {
      "0-200": 0, "200-400": 0, "400-600": 0, "600-800": 0, "800+": 0,
    };

    scores.forEach((s) => {
      const ts = s.total_score || 0;
      totalScore += ts;
      if      (ts < 200) distribution["0-200"]++;
      else if (ts < 400) distribution["200-400"]++;
      else if (ts < 600) distribution["400-600"]++;
      else if (ts < 800) distribution["600-800"]++;
      else               distribution["800+"]++;
    });

    const specMap: Record<string, number> = {};
    students.forEach((s) => {
      const spec = s.specialization || "Unknown";
      specMap[spec] = (specMap[spec] || 0) + 1;
    });

    const sortedScores = [...scores]
      .sort((a, b) => (b.total_score || 0) - (a.total_score || 0))
      .slice(0, 5);

    const topPerformers = sortedScores.map((s) => {
      const student = students.find((u) => u.id === s.user_id);
      return {
        name:            student?.name           || "Unknown",
        college_id:      student?.college_id     || "",
        specialization:  student?.specialization || "",
        total_score:     s.total_score           || 0,
        coding_score:    s.coding_score          || 0,
        academics_score: s.academics_score       || 0,
      };
    });

    const avgLcSolved = coding.length > 0
      ? Math.round(coding.reduce((sum, c) => sum + (c.lc_total_solved || 0), 0) / coding.length) : 0;
    const avgCfRating = coding.length > 0
      ? Math.round(coding.reduce((sum, c) => sum + (c.cf_rating || 0), 0) / coding.length) : 0;

    const portalCount = students.filter((s) => s.top_label === 1).length;

    res.status(200).json({
      success: true,
      data: {
        batch,
        total_students:           students.length,
        portal_students:          portalCount,
        analytics_only:           students.length - portalCount,
        active_today:             activeToday,
        avg_score:                scores.length > 0 ? Math.round(totalScore / scores.length) : 0,
        avg_lc_solved:            avgLcSolved,
        avg_cf_rating:            avgCfRating,
        score_distribution:       distribution,
        specialization_breakdown: Object.entries(specMap).map(([spec, count]) => ({ spec, count })),
        top_performers:           topPerformers,
      },
      message: `Batch ${batch} analytics fetched`,
    });
  } catch (err) {
    console.error("getBatchAnalytics error:", err);
    res.status(500).json({ success: false, data: null, message: "Internal server error" });
  }
};

// ────────────────────────────────────────────────────────────
// GET /admin/analytics/growth
// ────────────────────────────────────────────────────────────
export const getGrowthAnalytics = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await DailySolveLog.aggregate([
      { $match: { total_solved: { $gt: 0 } } },
      {
        $addFields: {
          week: { $isoWeek:     { $toDate: "$date" } },
          year: { $isoWeekYear: { $toDate: "$date" } },
        },
      },
      {
        $group: {
          _id:         { week: "$week", year: "$year" },
          solves:      { $sum: "$total_solved" },
          activeUsers: { $addToSet: "$user_id" },
        },
      },
      {
        $project: {
          week:        "$_id.week",
          year:        "$_id.year",
          solves:      1,
          activeUsers: { $size: "$activeUsers" },
          _id:         0,
        },
      },
      { $sort:  { year: 1, week: 1 } },
      { $limit: 12 },
    ]);

    res.status(200).json({ success: true, data, message: "Growth analytics fetched" });
  } catch (err) {
    console.error("getGrowthAnalytics error:", err);
    res.status(500).json({ success: false, data: null, message: "Internal server error" });
  }
};