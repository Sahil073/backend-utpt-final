"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteResource = exports.uploadResource = exports.getResources = void 0;
const db_1 = require("../config/db");
const cloudinary_service_1 = require("../services/cloudinary.service");
// ────────────────────────────────────────────────────────────
// GET /resources
// Query: ?batch=2022-26&subject=DSA&page=1
// ────────────────────────────────────────────────────────────
const getResources = async (req, res) => {
    try {
        const { batch, subject, page = "1" } = req.query;
        const limit = 20;
        const offset = (parseInt(page) - 1) * limit;
        let query = db_1.supabase
            .from("resources")
            .select("id, title, description, file_url, file_type, batch, subject, created_at, users(name, username)", { count: "exact" })
            .range(offset, offset + limit - 1)
            .order("created_at", { ascending: false });
        if (batch)
            query = query.eq("batch", batch);
        if (subject)
            query = query.eq("subject", subject);
        const { data, error, count } = await query;
        if (error) {
            res.status(500).json({ success: false, data: null, message: error.message });
            return;
        }
        res.status(200).json({
            success: true,
            data: { resources: data, total: count, page: parseInt(page) },
            message: "Resources fetched",
        });
    }
    catch (err) {
        console.error("getResources error:", err);
        res.status(500).json({ success: false, data: null, message: "Internal server error" });
    }
};
exports.getResources = getResources;
// ────────────────────────────────────────────────────────────
// POST /resources
// Supports both: file upload (multipart) OR JSON body with file_url
// ────────────────────────────────────────────────────────────
const uploadResource = async (req, res) => {
    try {
        const uploadedBy = req.user.id;
        const { title, description, batch, subject, file_url, file_type } = req.body;
        if (!title) {
            res.status(400).json({ success: false, data: null, message: "title is required" });
            return;
        }
        let finalFileUrl = file_url || null;
        let finalFileType = file_type || "pdf";
        if (req.file) {
            // File upload path — upload to Cloudinary
            finalFileUrl = await (0, cloudinary_service_1.uploadToCloudinary)(req.file.buffer, "utpt/resources", `resource_${Date.now()}`, "raw");
            finalFileType = "pdf";
        }
        if (!finalFileUrl) {
            res.status(400).json({ success: false, data: null, message: "Either file upload or file_url is required" });
            return;
        }
        const { data, error } = await db_1.supabase
            .from("resources")
            .insert({
            title,
            description: description || null,
            file_url: finalFileUrl,
            file_type: finalFileType,
            uploaded_by: uploadedBy,
            batch: batch || null,
            subject: subject || null,
        })
            .select()
            .single();
        if (error) {
            console.error("Supabase error:", error);
            res.status(500).json({ success: false, data: null, message: error.message });
            return;
        }
        res.status(201).json({
            success: true,
            data,
            message: "Resource uploaded successfully",
        });
    }
    catch (err) {
        console.error("uploadResource error:", err);
        res.status(500).json({ success: false, data: null, message: "Internal server error" });
    }
};
exports.uploadResource = uploadResource;
// ────────────────────────────────────────────────────────────
// DELETE /resources/:id
// ────────────────────────────────────────────────────────────
const deleteResource = async (req, res) => {
    try {
        const { id } = req.params;
        const { data: resource, error: fetchErr } = await db_1.supabase
            .from("resources")
            .select("id, file_url")
            .eq("id", id)
            .single();
        if (fetchErr || !resource) {
            res.status(404).json({ success: false, data: null, message: "Resource not found" });
            return;
        }
        // Try to delete from Cloudinary if it's a cloudinary URL
        if (resource.file_url && resource.file_url.includes("cloudinary")) {
            try {
                const urlParts = resource.file_url.split("/");
                const publicId = `utpt/resources/${urlParts[urlParts.length - 1].split(".")[0]}`;
                await (0, cloudinary_service_1.deleteFromCloudinary)(publicId);
            }
            catch {
                console.warn("Cloudinary delete failed — continuing with DB delete");
            }
        }
        await db_1.supabase.from("resources").delete().eq("id", id);
        res.status(200).json({
            success: true,
            data: null,
            message: "Resource deleted",
        });
    }
    catch (err) {
        console.error("deleteResource error:", err);
        res.status(500).json({ success: false, data: null, message: "Internal server error" });
    }
};
exports.deleteResource = deleteResource;
