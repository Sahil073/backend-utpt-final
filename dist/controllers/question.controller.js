"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteQuestion = exports.updateQuestion = exports.createQuestion = exports.getQuestions = void 0;
const db_1 = require("../config/db");
// ────────────────────────────────────────────────────────────
// GET /questions
// Query: ?difficulty=easy&tag=array&page=1&search=two+sum
// ────────────────────────────────────────────────────────────
const getQuestions = async (req, res) => {
    try {
        const { difficulty, tag, search, page = "1" } = req.query;
        const limit = 20;
        const offset = (parseInt(page) - 1) * limit;
        let query = db_1.supabase
            .from("questions")
            .select("id, title, description, difficulty, tags, platform_link, created_at, users(name)", { count: "exact" })
            .range(offset, offset + limit - 1)
            .order("created_at", { ascending: false });
        if (difficulty)
            query = query.eq("difficulty", difficulty);
        if (search)
            query = query.ilike("title", `%${search}%`);
        if (tag)
            query = query.contains("tags", [tag]);
        const { data, error, count } = await query;
        if (error) {
            res.status(500).json({ success: false, data: null, message: error.message });
            return;
        }
        res.status(200).json({
            success: true,
            data: { questions: data, total: count, page: parseInt(page) },
            message: "Questions fetched",
        });
    }
    catch (err) {
        console.error("getQuestions error:", err);
        res.status(500).json({ success: false, data: null, message: "Internal server error" });
    }
};
exports.getQuestions = getQuestions;
// ────────────────────────────────────────────────────────────
// POST /questions
// Body: { title, description, difficulty, tags[], platform_link }
// ────────────────────────────────────────────────────────────
const createQuestion = async (req, res) => {
    try {
        const createdBy = req.user.id;
        const { title, description, difficulty, tags, platform_link } = req.body;
        if (!title || !difficulty) {
            res.status(400).json({
                success: false,
                data: null,
                message: "title and difficulty are required",
            });
            return;
        }
        const { data, error } = await db_1.supabase
            .from("questions")
            .insert({
            title,
            description: description || null,
            difficulty,
            tags: tags || [],
            platform_link: platform_link || null,
            created_by: createdBy,
        })
            .select()
            .single();
        if (error) {
            res.status(500).json({ success: false, data: null, message: error.message });
            return;
        }
        res.status(201).json({
            success: true,
            data,
            message: "Question created",
        });
    }
    catch (err) {
        console.error("createQuestion error:", err);
        res.status(500).json({ success: false, data: null, message: "Internal server error" });
    }
};
exports.createQuestion = createQuestion;
// ────────────────────────────────────────────────────────────
// PUT /questions/:id
// ────────────────────────────────────────────────────────────
const updateQuestion = async (req, res) => {
    try {
        const { id } = req.params;
        const allowed = ["title", "description", "difficulty", "tags", "platform_link"];
        const updates = {};
        for (const key of allowed) {
            if (req.body[key] !== undefined)
                updates[key] = req.body[key];
        }
        if (Object.keys(updates).length === 0) {
            res.status(400).json({ success: false, data: null, message: "No valid fields to update" });
            return;
        }
        const { data, error } = await db_1.supabase
            .from("questions")
            .update(updates)
            .eq("id", id)
            .select()
            .single();
        if (error) {
            res.status(500).json({ success: false, data: null, message: error.message });
            return;
        }
        res.status(200).json({ success: true, data, message: "Question updated" });
    }
    catch (err) {
        console.error("updateQuestion error:", err);
        res.status(500).json({ success: false, data: null, message: "Internal server error" });
    }
};
exports.updateQuestion = updateQuestion;
// ────────────────────────────────────────────────────────────
// DELETE /questions/:id  (Admin only)
// ────────────────────────────────────────────────────────────
const deleteQuestion = async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await db_1.supabase
            .from("questions")
            .delete()
            .eq("id", id);
        if (error) {
            res.status(500).json({ success: false, data: null, message: error.message });
            return;
        }
        res.status(200).json({ success: true, data: null, message: "Question deleted" });
    }
    catch (err) {
        console.error("deleteQuestion error:", err);
        res.status(500).json({ success: false, data: null, message: "Internal server error" });
    }
};
exports.deleteQuestion = deleteQuestion;
