import { Request, Response } from "express";
import { supabase } from "../config/db";

// ────────────────────────────────────────────────────────────
// GET /questions
// Query: ?difficulty=easy&tag=array&page=1&search=two+sum
// ────────────────────────────────────────────────────────────
export const getQuestions = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { difficulty, tag, search, page = "1" } = req.query;
    const limit  = 20;
    const offset = (parseInt(page as string) - 1) * limit;

    let query = supabase
      .from("questions")
      .select(
        "id, title, description, difficulty, tags, platform_link, created_at, users(name)",
        { count: "exact" }
      )
      .range(offset, offset + limit - 1)
      .order("created_at", { ascending: false });

    if (difficulty) query = query.eq("difficulty", difficulty);
    if (search)     query = query.ilike("title", `%${search}%`);
    if (tag)        query = query.contains("tags", [tag as string]);

    const { data, error, count } = await query;

    if (error) {
      res.status(500).json({ success: false, data: null, message: error.message });
      return;
    }

    res.status(200).json({
      success: true,
      data:    { questions: data, total: count, page: parseInt(page as string) },
      message: "Questions fetched",
    });
  } catch (err) {
    console.error("getQuestions error:", err);
    res.status(500).json({ success: false, data: null, message: "Internal server error" });
  }
};

// ────────────────────────────────────────────────────────────
// POST /questions
// Body: { title, description, difficulty, tags[], platform_link }
// ────────────────────────────────────────────────────────────
export const createQuestion = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const createdBy = req.user!.id;
    const { title, description, difficulty, tags, platform_link } = req.body;

    if (!title || !difficulty) {
      res.status(400).json({
        success: false,
        data:    null,
        message: "title and difficulty are required",
      });
      return;
    }

    const { data, error } = await supabase
      .from("questions")
      .insert({
        title,
        description:   description   || null,
        difficulty,
        tags:          tags          || [],
        platform_link: platform_link || null,
        created_by:    createdBy,
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
  } catch (err) {
    console.error("createQuestion error:", err);
    res.status(500).json({ success: false, data: null, message: "Internal server error" });
  }
};

// ────────────────────────────────────────────────────────────
// PUT /questions/:id
// ────────────────────────────────────────────────────────────
export const updateQuestion = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const allowed = ["title", "description", "difficulty", "tags", "platform_link"];
    const updates: Record<string, any> = {};

    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ success: false, data: null, message: "No valid fields to update" });
      return;
    }

    const { data, error } = await supabase
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
  } catch (err) {
    console.error("updateQuestion error:", err);
    res.status(500).json({ success: false, data: null, message: "Internal server error" });
  }
};

// ────────────────────────────────────────────────────────────
// DELETE /questions/:id  (Admin only)
// ────────────────────────────────────────────────────────────
export const deleteQuestion = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from("questions")
      .delete()
      .eq("id", id);

    if (error) {
      res.status(500).json({ success: false, data: null, message: error.message });
      return;
    }

    res.status(200).json({ success: true, data: null, message: "Question deleted" });
  } catch (err) {
    console.error("deleteQuestion error:", err);
    res.status(500).json({ success: false, data: null, message: "Internal server error" });
  }
};