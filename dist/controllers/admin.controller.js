"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGrowthAnalytics = exports.getBatchAnalytics = exports.searchStudentByEmail = exports.createTrainer = exports.getActivityAnalytics = exports.toggleStudentActive = exports.importStudentsFromFile = exports.importStudents = exports.sendAdminNotification = exports.getFullLeaderboard = exports.getTopPerformers = exports.getPoorPerformers = exports.getStudentDetail = exports.getAllStudents = exports.getDashboard = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const db_1 = require("../config/db");
const DailySolveLog_model_1 = require("../models/DailySolveLog.model");
const notification_service_1 = require("../services/notification.service");
const XLSX = __importStar(require("xlsx"));
const sync_1 = require("csv-parse/sync");
// ────────────────────────────────────────────────────────────
// GET /admin/dashboard
// ────────────────────────────────────────────────────────────
const getDashboard = async (req, res) => {
    try {
        const { count: totalStudents } = await db_1.supabase
            .from("users")
            .select("*", { count: "exact", head: true })
            .eq("role", "student");
        const { data: scoreData } = await db_1.supabase
            .from("scores")
            .select("total_score");
        const avgScore = scoreData && scoreData.length > 0
            ? Math.round(scoreData.reduce((sum, s) => sum + (s.total_score || 0), 0) /
                scoreData.length)
            : 0;
        const today = new Date().toISOString().slice(0, 10);
        const activeToday = await DailySolveLog_model_1.DailySolveLog.countDocuments({
            date: today,
            total_solved: { $gt: 0 },
        });
        const { data: topScorerData } = await db_1.supabase
            .from("scores")
            .select("user_id, total_score")
            .order("total_score", { ascending: false })
            .limit(1)
            .single();
        let topScorer = null;
        if (topScorerData) {
            const { data: topUser } = await db_1.supabase
                .from("users")
                .select("name, username, college_id")
                .eq("id", topScorerData.user_id)
                .single();
            topScorer = { ...topScorerData, name: topUser?.name, username: topUser?.username };
        }
        // Count top_label students (tracked but no portal)
        const { count: analyticsOnly } = await db_1.supabase
            .from("users")
            .select("*", { count: "exact", head: true })
            .eq("role", "student")
            .eq("top_label", 0);
        res.status(200).json({
            success: true,
            data: {
                total_students: totalStudents,
                active_today: activeToday,
                avg_score: avgScore,
                top_scorer: topScorer,
                analytics_only: analyticsOnly ?? 0,
            },
            message: "Dashboard stats fetched",
        });
    }
    catch (err) {
        console.error("getDashboard error:", err);
        res.status(500).json({ success: false, data: null, message: "Internal server error" });
    }
};
exports.getDashboard = getDashboard;
// ────────────────────────────────────────────────────────────
// GET /admin/students
// ────────────────────────────────────────────────────────────
const getAllStudents = async (req, res) => {
    try {
        const { batch, specialization, name, page = "1", top_label } = req.query;
        const limit = 20;
        const offset = (parseInt(page) - 1) * limit;
        let query = db_1.supabase
            .from("users")
            .select("id, name, username, email, college_id, batch, specialization, avatar_url, is_active, top_label, gender, cpi, tenth_percentage, twelfth_percentage, created_at", { count: "exact" })
            .eq("role", "student")
            .range(offset, offset + limit - 1)
            .order("created_at", { ascending: false });
        if (batch)
            query = query.eq("batch", batch);
        if (specialization)
            query = query.eq("specialization", specialization);
        if (name)
            query = query.ilike("name", `%${name}%`);
        if (top_label !== undefined)
            query = query.eq("top_label", parseInt(top_label));
        const { data: students, error, count } = await query;
        if (error) {
            res.status(500).json({ success: false, data: null, message: error.message });
            return;
        }
        const studentIds = (students || []).map((s) => s.id);
        let scoresMap = {};
        if (studentIds.length > 0) {
            const { data: scores } = await db_1.supabase
                .from("scores")
                .select("user_id, total_score")
                .in("user_id", studentIds);
            (scores || []).forEach((s) => { scoresMap[s.user_id] = s.total_score; });
        }
        const enriched = (students || []).map((s) => ({
            ...s,
            total_score: scoresMap[s.id] ?? 0,
        }));
        res.status(200).json({
            success: true,
            data: enriched,
            pagination: { total: count, page: parseInt(page), limit },
            message: "Students fetched",
        });
    }
    catch (err) {
        console.error("getAllStudents error:", err);
        res.status(500).json({ success: false, data: null, message: "Internal server error" });
    }
};
exports.getAllStudents = getAllStudents;
// ────────────────────────────────────────────────────────────
// GET /admin/students/:id/detail
// ────────────────────────────────────────────────────────────
const getStudentDetail = async (req, res) => {
    try {
        const { id } = req.params;
        const [userRes, codingRes, githubRes, scoreRes] = await Promise.all([
            db_1.supabase.from("users").select("*").eq("id", id).single(),
            db_1.supabase.from("coding_stats").select("*").eq("user_id", id).single(),
            db_1.supabase.from("github_stats").select("*").eq("user_id", id).single(),
            db_1.supabase.from("scores").select("*").eq("user_id", id).single(),
        ]);
        if (!userRes.data) {
            res.status(404).json({ success: false, data: null, message: "Student not found" });
            return;
        }
        const since = new Date();
        since.setDate(since.getDate() - 30);
        const sinceStr = since.toISOString().slice(0, 10);
        const history = await DailySolveLog_model_1.DailySolveLog.find({ user_id: id, date: { $gte: sinceStr } })
            .sort({ date: -1 })
            .lean();
        const profile = userRes.data;
        const coding = codingRes.data;
        const github = githubRes.data;
        const score = scoreRes.data;
        res.status(200).json({
            success: true,
            data: {
                profile: {
                    ...profile,
                    github_username: profile.github_username,
                },
                stats: {
                    academics: {
                        tenth_percentage: profile.tenth_percentage ?? null,
                        twelfth_percentage: profile.twelfth_percentage ?? null,
                        cpi: profile.cpi ?? null,
                    },
                    coding: {
                        leetcode_solved: coding?.lc_total_solved ?? 0,
                        codeforces_rating: coding?.cf_rating ?? 0,
                        codeforces_solved: coding?.cf_solved ?? 0,
                        leetcode_username: profile.leetcode_username,
                        codeforces_username: profile.codeforces_username,
                    },
                    github: {
                        total_commits: github?.total_commits ?? 0,
                        public_repos: github?.repos_contributed ?? 0,
                    },
                    score: {
                        total_score: score?.total_score ?? 0,
                        academics_score: score?.academics_score ?? 0,
                        coding_score: score?.coding_score ?? 0,
                        dev_score: score?.dev_score ?? 0,
                        rank: score?.rank ?? null,
                    },
                },
                history,
            },
            message: "Student detail fetched",
        });
    }
    catch (err) {
        console.error("getStudentDetail error:", err);
        res.status(500).json({ success: false, data: null, message: "Internal server error" });
    }
};
exports.getStudentDetail = getStudentDetail;
// ────────────────────────────────────────────────────────────
// GET /admin/poor-performers
// ────────────────────────────────────────────────────────────
const getPoorPerformers = async (req, res) => {
    try {
        const since = new Date();
        since.setDate(since.getDate() - 7);
        const sinceStr = since.toISOString().slice(0, 10);
        const { data: students } = await db_1.supabase
            .from("users")
            .select("id, name, username, email, college_id, batch, specialization, avatar_url")
            .eq("role", "student")
            .eq("is_active", true)
            .eq("top_label", 1);
        if (!students || students.length === 0) {
            res.status(200).json({ success: true, data: [], message: "No students found" });
            return;
        }
        const activeLogs = await DailySolveLog_model_1.DailySolveLog.distinct("user_id", {
            date: { $gte: sinceStr },
            total_solved: { $gt: 0 },
        });
        const activeSet = new Set(activeLogs);
        const poorPerformers = students.filter((s) => !activeSet.has(s.id));
        const enriched = await Promise.all(poorPerformers.map(async (s) => {
            const lastLog = await DailySolveLog_model_1.DailySolveLog.findOne({ user_id: s.id, total_solved: { $gt: 0 } })
                .sort({ date: -1 })
                .lean();
            return { ...s, last_active: lastLog?.date || null };
        }));
        res.status(200).json({
            success: true,
            data: enriched,
            message: "Poor performers fetched",
        });
    }
    catch (err) {
        console.error("getPoorPerformers error:", err);
        res.status(500).json({ success: false, data: null, message: "Internal server error" });
    }
};
exports.getPoorPerformers = getPoorPerformers;
// ────────────────────────────────────────────────────────────
// GET /admin/top-performers
// ────────────────────────────────────────────────────────────
const getTopPerformers = async (req, res) => {
    try {
        const { data: topScores } = await db_1.supabase
            .from("scores")
            .select("user_id, total_score, rank, academics_score, coding_score, dev_score")
            .order("total_score", { ascending: false })
            .limit(10);
        const topIds = (topScores || []).map((s) => s.user_id);
        let topUsers = {};
        if (topIds.length > 0) {
            const { data: users } = await db_1.supabase
                .from("users")
                .select("id, name, username, avatar_url, batch, specialization")
                .in("id", topIds);
            (users || []).forEach((u) => { topUsers[u.id] = u; });
        }
        const globalTop = (topScores || []).map((s) => ({
            ...topUsers[s.user_id],
            total_score: s.total_score,
            academics_score: s.academics_score,
            coding_score: s.coding_score,
            dev_score: s.dev_score,
            rank: s.rank,
        }));
        res.status(200).json({
            success: true,
            data: { global: globalTop, top_global: globalTop },
            message: "Top performers fetched",
        });
    }
    catch (err) {
        console.error("getTopPerformers error:", err);
        res.status(500).json({ success: false, data: null, message: "Internal server error" });
    }
};
exports.getTopPerformers = getTopPerformers;
// ────────────────────────────────────────────────────────────
// GET /admin/leaderboard
// ────────────────────────────────────────────────────────────
const getFullLeaderboard = async (req, res) => {
    try {
        const { data: scores, error } = await db_1.supabase
            .from("scores")
            .select("user_id, total_score, coding_score, dev_score, academics_score, rank")
            .order("total_score", { ascending: false });
        if (error) {
            res.status(500).json({ success: false, data: null, message: error.message });
            return;
        }
        const ids = (scores || []).map((s) => s.user_id);
        let usersMap = {};
        if (ids.length > 0) {
            const { data: users } = await db_1.supabase
                .from("users")
                .select("id, name, username, avatar_url, batch, specialization")
                .in("id", ids);
            (users || []).forEach((u) => { usersMap[u.id] = u; });
        }
        const data = (scores || []).map((s) => ({ ...usersMap[s.user_id], ...s }));
        res.status(200).json({ success: true, data, message: "Full leaderboard fetched" });
    }
    catch (err) {
        console.error("getFullLeaderboard error:", err);
        res.status(500).json({ success: false, data: null, message: "Internal server error" });
    }
};
exports.getFullLeaderboard = getFullLeaderboard;
// ────────────────────────────────────────────────────────────
// POST /admin/notify/send
// ────────────────────────────────────────────────────────────
const sendAdminNotification = async (req, res) => {
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
            notifType: type || "announcement",
            sendEmail: true,
            sendPush: true,
            io,
        };
        if (target === "all") {
            (0, notification_service_1.sendToAll)(opts).catch(console.error);
        }
        else if (target === "batch" && batch) {
            (0, notification_service_1.sendToBatch)(batch, opts).catch(console.error);
        }
        else if (target === "user" && userId) {
            (0, notification_service_1.sendToUser)(userId, opts).catch(console.error);
        }
        else {
            res.status(400).json({ success: false, data: null, message: "Invalid target. Use all | batch (with batch) | user (with userId)" });
            return;
        }
        res.status(202).json({ success: true, data: null, message: `Notification queued for target: ${target}` });
    }
    catch (err) {
        console.error("sendAdminNotification error:", err);
        res.status(500).json({ success: false, data: null, message: "Internal server error" });
    }
};
exports.sendAdminNotification = sendAdminNotification;
// ────────────────────────────────────────────────────────────
// POST /admin/import-students  (JSON body)
// New fields: tenth_percentage, twelfth_percentage, cpi, gender, top_label, father_number
// top_label=1 → create portal account (father_number as initial password)
// top_label=0 → store only (no login access)
// ────────────────────────────────────────────────────────────
const importStudents = async (req, res) => {
    try {
        const students = req.body.students;
        if (!Array.isArray(students) || students.length === 0) {
            res.status(400).json({ success: false, data: null, message: "students array is required" });
            return;
        }
        const result = await processStudentImport(students);
        res.status(200).json({
            success: true,
            data: result,
            message: `${result.total} students processed (${result.portal_accounts} portal accounts created)`,
        });
    }
    catch (err) {
        console.error("importStudents error:", err);
        res.status(500).json({ success: false, data: null, message: "Internal server error" });
    }
};
exports.importStudents = importStudents;
function normalizeRow(raw) {
    const get = (...keys) => {
        for (const k of keys) {
            const found = Object.keys(raw).find((rk) => rk.trim().toLowerCase().replace(/[\s_\-]/g, "") === k.toLowerCase().replace(/[\s_\-]/g, ""));
            if (found && raw[found]?.trim())
                return raw[found].trim();
        }
        return "";
    };
    const topLabelRaw = get("toplabel", "top_label", "label", "portal");
    const topLabel = topLabelRaw === "1" || topLabelRaw.toLowerCase() === "yes" ? 1 : 0;
    const tenthRaw = get("tenth", "tenth_percentage", "10th", "10thpercent", "tenthpercent");
    const twelfthRaw = get("twelfth", "twelfth_percentage", "12th", "12thpercent", "twelfthpercent");
    const cpiRaw = get("cpi", "cgpa", "gpa");
    return {
        name: get("name", "fullname", "studentname"),
        college_id: get("collegeid", "college_id", "enrollment", "enrollmentno", "id"),
        email: get("email", "emailid", "collegemail"),
        batch: get("batch", "year", "batchyear"),
        specialization: get("specialization", "spec", "branch", "department") || undefined,
        roll_number: get("rollnumber", "roll_number", "rollno", "roll") || undefined,
        leetcode_username: get("leetcodeusername", "leetcode_username", "leetcode", "lc") || undefined,
        github_username: get("githubusername", "github_username", "github", "gh") || undefined,
        codeforces_username: get("codeforcesusername", "codeforces_username", "codeforces", "cf", "cfhandle") || undefined,
        tenth_percentage: tenthRaw ? parseFloat(tenthRaw) : undefined,
        twelfth_percentage: twelfthRaw ? parseFloat(twelfthRaw) : undefined,
        cpi: cpiRaw ? parseFloat(cpiRaw) : undefined,
        gender: get("gender", "sex") || undefined,
        top_label: topLabel,
        father_number: get("fathernumber", "father_number", "fathermobile", "fatherphone", "fathercontact") || undefined,
    };
}
// Auto-generate initial password for portal students
// Priority: father_number → roll_number@name(first4) → college_id@utpt
function generateInitialPassword(s) {
    if (s.father_number)
        return s.father_number;
    if (s.roll_number && s.name) {
        return `${s.roll_number}@${s.name.substring(0, 4).toLowerCase()}`;
    }
    if (s.roll_number)
        return s.roll_number;
    return `${s.college_id}@utpt`;
}
// Core import logic — shared by JSON and file endpoints
async function processStudentImport(students) {
    let portalCount = 0;
    let analyticsCount = 0;
    for (const s of students) {
        const isPortal = (s.top_label ?? 0) === 1;
        let passwordHash = null;
        if (isPortal) {
            const rawPassword = generateInitialPassword(s);
            passwordHash = await bcryptjs_1.default.hash(rawPassword, 12);
        }
        const record = {
            name: s.name,
            college_id: s.college_id,
            email: s.email,
            batch: s.batch,
            specialization: s.specialization || null,
            roll_number: s.roll_number || null,
            leetcode_username: s.leetcode_username || null,
            github_username: s.github_username || null,
            codeforces_username: s.codeforces_username || null,
            tenth_percentage: s.tenth_percentage ?? null,
            twelfth_percentage: s.twelfth_percentage ?? null,
            cpi: s.cpi ?? null,
            gender: s.gender || null,
            top_label: s.top_label ?? 0,
            role: "student",
            is_active: isPortal,
            is_verified: isPortal,
            force_password_change: isPortal ? true : false,
        };
        if (isPortal && passwordHash) {
            record.password_hash = passwordHash;
        }
        await db_1.supabase
            .from("users")
            .upsert(record, { onConflict: "college_id", ignoreDuplicates: false });
        if (isPortal)
            portalCount++;
        else
            analyticsCount++;
    }
    return {
        total: students.length,
        portal_accounts: portalCount,
        analytics_only: analyticsCount,
    };
}
const importStudentsFromFile = async (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ success: false, data: null, message: "No file uploaded. Please upload a CSV or Excel file." });
            return;
        }
        const ext = req.file.originalname.split(".").pop()?.toLowerCase();
        let rows = [];
        if (ext === "csv") {
            const text = req.file.buffer.toString("utf-8");
            rows = (0, sync_1.parse)(text, { columns: true, skip_empty_lines: true, trim: true });
        }
        else if (ext === "xlsx" || ext === "xls") {
            const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
        }
        else {
            res.status(400).json({ success: false, data: null, message: "Unsupported file format. Use CSV or Excel (.xlsx/.xls)." });
            return;
        }
        if (!rows || rows.length === 0) {
            res.status(400).json({ success: false, data: null, message: "File is empty or could not be parsed." });
            return;
        }
        const students = rows.map(normalizeRow);
        const errors = [];
        students.forEach((s, i) => {
            if (!s.name)
                errors.push(`Row ${i + 2}: missing name`);
            if (!s.college_id)
                errors.push(`Row ${i + 2}: missing college_id / enrollment`);
            if (!s.email)
                errors.push(`Row ${i + 2}: missing email`);
            if (!s.batch)
                errors.push(`Row ${i + 2}: missing batch`);
        });
        if (errors.length > 0) {
            res.status(400).json({
                success: false,
                data: { errors },
                message: `Validation failed for ${errors.length} row(s). Fix and re-upload.`,
            });
            return;
        }
        const result = await processStudentImport(students);
        res.status(200).json({
            success: true,
            data: { ...result, file: req.file.originalname },
            message: `${result.total} students imported from ${req.file.originalname} (${result.portal_accounts} portal accounts)`,
        });
    }
    catch (err) {
        console.error("importStudentsFromFile error:", err);
        res.status(500).json({ success: false, data: null, message: "Failed to parse or import file." });
    }
};
exports.importStudentsFromFile = importStudentsFromFile;
// ────────────────────────────────────────────────────────────
// PUT /admin/students/:id/toggle-active
// ────────────────────────────────────────────────────────────
const toggleStudentActive = async (req, res) => {
    try {
        const { id } = req.params;
        const { data: user } = await db_1.supabase
            .from("users")
            .select("is_active")
            .eq("id", id)
            .single();
        if (!user) {
            res.status(404).json({ success: false, data: null, message: "Student not found" });
            return;
        }
        const { data: updated } = await db_1.supabase
            .from("users")
            .update({ is_active: !user.is_active })
            .eq("id", id)
            .select("id, name, is_active")
            .single();
        res.status(200).json({
            success: true,
            data: updated,
            message: `Student ${updated?.is_active ? "activated" : "deactivated"}`,
        });
    }
    catch (err) {
        console.error("toggleStudentActive error:", err);
        res.status(500).json({ success: false, data: null, message: "Internal server error" });
    }
};
exports.toggleStudentActive = toggleStudentActive;
// ────────────────────────────────────────────────────────────
// GET /admin/analytics/activity
// ────────────────────────────────────────────────────────────
const getActivityAnalytics = async (req, res) => {
    try {
        const since = new Date();
        since.setDate(since.getDate() - 30);
        const sinceStr = since.toISOString().slice(0, 10);
        const data = await DailySolveLog_model_1.DailySolveLog.aggregate([
            { $match: { date: { $gte: sinceStr }, total_solved: { $gt: 0 } } },
            {
                $group: {
                    _id: "$date",
                    count: { $sum: 1 },
                    totalSolves: { $sum: "$total_solved" },
                },
            },
            { $sort: { _id: 1 } },
            { $project: { date: "$_id", count: 1, totalSolves: 1, _id: 0 } },
        ]);
        res.status(200).json({ success: true, data, message: "Activity analytics fetched" });
    }
    catch (err) {
        console.error("getActivityAnalytics error:", err);
        res.status(500).json({ success: false, data: null, message: "Internal server error" });
    }
};
exports.getActivityAnalytics = getActivityAnalytics;
// ────────────────────────────────────────────────────────────
// POST /admin/create-trainer
// ────────────────────────────────────────────────────────────
const createTrainer = async (req, res) => {
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
            db_1.supabase.from("users").select("id").eq("email", email).maybeSingle(),
            db_1.supabase.from("users").select("id").eq("college_id", college_id).maybeSingle(),
        ]);
        if (emailCheck.data || cidCheck.data) {
            res.status(409).json({ success: false, data: null, message: "Email or college_id already in use" });
            return;
        }
        const passwordHash = await bcryptjs_1.default.hash(password, 12);
        const { data: trainer, error } = await db_1.supabase
            .from("users")
            .insert({
            name,
            email,
            college_id,
            password_hash: passwordHash,
            role: "trainer",
            is_active: true,
            is_verified: true,
            force_password_change: false,
        })
            .select("id, name, email, college_id, role")
            .single();
        if (error || !trainer) {
            res.status(500).json({ success: false, data: null, message: error?.message || "Failed to create trainer" });
            return;
        }
        res.status(201).json({ success: true, data: trainer, message: "Trainer created successfully" });
    }
    catch (err) {
        console.error("createTrainer error:", err);
        res.status(500).json({ success: false, data: null, message: "Internal server error" });
    }
};
exports.createTrainer = createTrainer;
// ────────────────────────────────────────────────────────────
// GET /admin/students/search
// ────────────────────────────────────────────────────────────
const searchStudentByEmail = async (req, res) => {
    try {
        const { q, email, name, college_id, batch } = req.query;
        if (!q && !email && !name && !college_id && !batch) {
            res.status(400).json({
                success: false,
                data: null,
                message: "Provide at least one search parameter: q, email, name, college_id, or batch",
            });
            return;
        }
        let query = db_1.supabase
            .from("users")
            .select("id, name, username, email, college_id, batch, specialization, avatar_url, is_active, top_label, gender")
            .eq("role", "student")
            .limit(50);
        if (q) {
            const term = q.trim();
            query = query.or(`name.ilike.%${term}%,email.ilike.%${term}%,college_id.ilike.%${term}%,username.ilike.%${term}%`);
        }
        else {
            const orParts = [];
            if (name)
                orParts.push(`name.ilike.%${name.trim()}%`);
            if (email)
                orParts.push(`email.ilike.%${email.trim()}%`);
            if (college_id)
                orParts.push(`college_id.ilike.%${college_id.trim()}%`);
            if (orParts.length > 0) {
                query = query.or(orParts.join(","));
            }
            if (batch)
                query = query.eq("batch", batch.trim());
        }
        query = query.order("name", { ascending: true });
        const { data: students, error } = await query;
        if (error) {
            res.status(500).json({ success: false, data: null, message: error.message });
            return;
        }
        res.status(200).json({
            success: true,
            data: students || [],
            message: `${(students || []).length} result(s) found`,
        });
    }
    catch (err) {
        console.error("searchStudents error:", err);
        res.status(500).json({ success: false, data: null, message: "Internal server error" });
    }
};
exports.searchStudentByEmail = searchStudentByEmail;
// ────────────────────────────────────────────────────────────
// GET /admin/analytics/batch?batch=2022-26
// ────────────────────────────────────────────────────────────
const getBatchAnalytics = async (req, res) => {
    try {
        const batch = req.query.batch?.trim();
        if (!batch) {
            res.status(400).json({ success: false, data: null, message: "batch query param is required" });
            return;
        }
        const { data: students } = await db_1.supabase
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
            db_1.supabase.from("scores").select("user_id, total_score, academics_score, coding_score, dev_score").in("user_id", studentIds),
            db_1.supabase.from("coding_stats").select("user_id, lc_total_solved, cf_rating").in("user_id", studentIds),
        ]);
        const today = new Date().toISOString().slice(0, 10);
        const activeToday = await DailySolveLog_model_1.DailySolveLog.countDocuments({
            user_id: { $in: studentIds },
            date: today,
            total_solved: { $gt: 0 },
        });
        const scores = scoresRes.data || [];
        const coding = codingRes.data || [];
        let totalScore = 0;
        const distribution = {
            "0-200": 0, "200-400": 0, "400-600": 0, "600-800": 0, "800+": 0,
        };
        scores.forEach((s) => {
            const ts = s.total_score || 0;
            totalScore += ts;
            if (ts < 200)
                distribution["0-200"]++;
            else if (ts < 400)
                distribution["200-400"]++;
            else if (ts < 600)
                distribution["400-600"]++;
            else if (ts < 800)
                distribution["600-800"]++;
            else
                distribution["800+"]++;
        });
        const specMap = {};
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
                name: student?.name || "Unknown",
                college_id: student?.college_id || "",
                specialization: student?.specialization || "",
                total_score: s.total_score || 0,
                coding_score: s.coding_score || 0,
                academics_score: s.academics_score || 0,
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
                total_students: students.length,
                portal_students: portalCount,
                analytics_only: students.length - portalCount,
                active_today: activeToday,
                avg_score: scores.length > 0 ? Math.round(totalScore / scores.length) : 0,
                avg_lc_solved: avgLcSolved,
                avg_cf_rating: avgCfRating,
                score_distribution: distribution,
                specialization_breakdown: Object.entries(specMap).map(([spec, count]) => ({ spec, count })),
                top_performers: topPerformers,
            },
            message: `Batch ${batch} analytics fetched`,
        });
    }
    catch (err) {
        console.error("getBatchAnalytics error:", err);
        res.status(500).json({ success: false, data: null, message: "Internal server error" });
    }
};
exports.getBatchAnalytics = getBatchAnalytics;
// ────────────────────────────────────────────────────────────
// GET /admin/analytics/growth
// ────────────────────────────────────────────────────────────
const getGrowthAnalytics = async (req, res) => {
    try {
        const data = await DailySolveLog_model_1.DailySolveLog.aggregate([
            { $match: { total_solved: { $gt: 0 } } },
            {
                $addFields: {
                    week: { $isoWeek: { $toDate: "$date" } },
                    year: { $isoWeekYear: { $toDate: "$date" } },
                },
            },
            {
                $group: {
                    _id: { week: "$week", year: "$year" },
                    solves: { $sum: "$total_solved" },
                    activeUsers: { $addToSet: "$user_id" },
                },
            },
            {
                $project: {
                    week: "$_id.week",
                    year: "$_id.year",
                    solves: 1,
                    activeUsers: { $size: "$activeUsers" },
                    _id: 0,
                },
            },
            { $sort: { year: 1, week: 1 } },
            { $limit: 12 },
        ]);
        res.status(200).json({ success: true, data, message: "Growth analytics fetched" });
    }
    catch (err) {
        console.error("getGrowthAnalytics error:", err);
        res.status(500).json({ success: false, data: null, message: "Internal server error" });
    }
};
exports.getGrowthAnalytics = getGrowthAnalytics;
