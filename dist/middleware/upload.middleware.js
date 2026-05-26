"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadStudentFile = exports.uploadPDF = exports.uploadAvatar = void 0;
const multer_1 = __importDefault(require("multer"));
// Store in memory — we send buffer directly to Cloudinary
const storage = multer_1.default.memoryStorage();
exports.uploadAvatar = (0, multer_1.default)({
    storage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB max
    fileFilter: (_req, file, cb) => {
        const allowed = ["image/jpeg", "image/png", "image/webp"];
        if (!allowed.includes(file.mimetype)) {
            cb(new Error("Only JPEG, PNG, and WEBP images are allowed"));
            return;
        }
        cb(null, true);
    },
});
exports.uploadPDF = (0, multer_1.default)({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
    fileFilter: (_req, file, cb) => {
        if (file.mimetype !== "application/pdf") {
            cb(new Error("Only PDF files are allowed"));
            return;
        }
        cb(null, true);
    },
});
// Accept CSV, Excel (.xlsx, .xls) for student bulk import
exports.uploadStudentFile = (0, multer_1.default)({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
    fileFilter: (_req, file, cb) => {
        const allowedMime = [
            "text/csv",
            "application/csv",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/octet-stream", // some browsers send this for .csv
        ];
        const ext = file.originalname.split(".").pop()?.toLowerCase();
        const allowedExt = ["csv", "xlsx", "xls"];
        if (!allowedExt.includes(ext || "") && !allowedMime.includes(file.mimetype)) {
            cb(new Error("Only CSV and Excel files (.csv, .xlsx, .xls) are allowed"));
            return;
        }
        cb(null, true);
    },
});
