"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Polyfill WebSocket for Node.js < 22 (required by Supabase realtime)
const ws_1 = require("ws");
if (!global.WebSocket) {
    global.WebSocket = ws_1.WebSocket;
}
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const socket_io_1 = require("socket.io");
const env_1 = require("./config/env");
const db_1 = require("./config/db");
// Models
require("./models/DailySolveLog.model");
require("./models/CommitLog.model");
require("./models/Notification.model");
// Routes
const health_routes_1 = __importDefault(require("./routes/health.routes"));
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const student_routes_1 = __importDefault(require("./routes/student.routes"));
const leaderboard_routes_1 = __importDefault(require("./routes/leaderboard.routes"));
const notification_routes_1 = __importDefault(require("./routes/notification.routes"));
const admin_routes_1 = __importDefault(require("./routes/admin.routes"));
const resource_routes_1 = __importDefault(require("./routes/resource.routes"));
const question_routes_1 = __importDefault(require("./routes/question.routes"));
// Jobs
const computeScores_job_1 = require("./jobs/computeScores.job");
const nudgePoorPerformers_job_1 = require("./jobs/nudgePoorPerformers.job");
const syncGitHub_job_1 = require("./jobs/syncGitHub.job");
const syncCoding_job_1 = require("./jobs/syncCoding.job");
// Middleware
const rateLimit_middleware_1 = require("./middleware/rateLimit.middleware");
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
app.set("trust proxy", 1);
// ─────────────────────────────────────────────────────────────
// Socket.IO
// ─────────────────────────────────────────────────────────────
const io = new socket_io_1.Server(server, {
    cors: {
        origin: (origin, cb) => {
            if (!origin)
                return cb(null, true);
            if (origin.includes("localhost") ||
                origin.includes("netlify.app") ||
                origin.includes("onrender.com") ||
                origin.includes("replit.dev") ||
                origin.includes("replit.app") ||
                (env_1.ENV.FRONTEND_URL && origin === env_1.ENV.FRONTEND_URL)) {
                return cb(null, true);
            }
            return cb(new Error(`Socket CORS blocked: ${origin}`));
        },
        credentials: true,
    },
});
app.set("io", io);
// ─────────────────────────────────────────────────────────────
// Frontend Static Hosting
// ─────────────────────────────────────────────────────────────
const publicDir = path_1.default.join(__dirname, "../public");
const hasPublic = fs_1.default.existsSync(publicDir);
if (hasPublic) {
    app.use(express_1.default.static(publicDir));
}
// ─────────────────────────────────────────────────────────────
// Core Middleware
// ─────────────────────────────────────────────────────────────
app.use(express_1.default.json({ limit: "10mb" }));
app.use(express_1.default.urlencoded({ extended: true }));
app.use((0, cookie_parser_1.default)());
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (!origin)
            return callback(null, true);
        const allowed = origin.includes("localhost") ||
            origin.includes("netlify.app") ||
            origin.includes("onrender.com") ||
            origin.includes("replit.dev") ||
            origin.includes("replit.app") ||
            (env_1.ENV.FRONTEND_URL && origin === env_1.ENV.FRONTEND_URL);
        if (allowed) {
            return callback(null, true);
        }
        console.error("❌ CORS blocked:", origin);
        return callback(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
}));
// Explicit preflight handling
app.options("*splat", (0, cors_1.default)());
app.use((0, helmet_1.default)({
    contentSecurityPolicy: false,
}));
app.use((0, morgan_1.default)("dev"));
app.use(rateLimit_middleware_1.globalLimiter);
// ─────────────────────────────────────────────────────────────
// API Routes
// ─────────────────────────────────────────────────────────────
app.use("/health", health_routes_1.default);
app.use("/api/v1/auth", auth_routes_1.default);
app.use("/api/v1/students", student_routes_1.default);
app.use("/api/v1/leaderboard", leaderboard_routes_1.default);
app.use("/api/v1/notifications", notification_routes_1.default);
app.use("/api/v1/admin", admin_routes_1.default);
app.use("/api/v1/resources", resource_routes_1.default);
app.use("/api/v1/questions", question_routes_1.default);
// ─────────────────────────────────────────────────────────────
// Socket Events
// ─────────────────────────────────────────────────────────────
io.on("connection", (socket) => {
    console.log("🔌 Connected:", socket.id);
    socket.on("join", ({ userId }) => {
        socket.join(`user:${userId}`);
    });
    socket.on("joinBatch", ({ batch }) => {
        socket.join(`batch:${batch}`);
    });
    socket.on("disconnect", () => {
        console.log("🔌 Disconnected:", socket.id);
    });
});
// ─────────────────────────────────────────────────────────────
// 404 + SPA Fallback
// ─────────────────────────────────────────────────────────────
app.use((req, res) => {
    // API → JSON 404
    if (req.path.startsWith("/api/") ||
        req.path.startsWith("/health")) {
        return res.status(404).json({
            success: false,
            data: null,
            message: "Route not found",
        });
    }
    // Static asset missing
    if (req.path.includes(".") &&
        hasPublic) {
        return res.status(404).send("Asset not found");
    }
    // SPA fallback
    if (hasPublic) {
        return res.sendFile(path_1.default.join(publicDir, "index.html"));
    }
    return res.status(200).json({
        success: true,
        data: null,
        message: "UTPT API running",
    });
});
// ─────────────────────────────────────────────────────────────
// Global Error Handler
// ─────────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
    console.error("🔥 Unhandled Error:", err);
    res.status(500).json({
        success: false,
        data: null,
        message: env_1.ENV.NODE_ENV === "production"
            ? "Internal server error"
            : err.message,
    });
});
// ─────────────────────────────────────────────────────────────
// Boot
// ─────────────────────────────────────────────────────────────
const boot = async () => {
    try {
        await (0, db_1.connectMongoDB)();
        console.log("✅ MongoDB connected");
        await (0, db_1.connectRedis)();
        console.log("✅ Redis connected");
        (0, computeScores_job_1.startComputeScoresJob)();
        (0, nudgePoorPerformers_job_1.startNudgeJob)(io);
        (0, syncGitHub_job_1.startSyncGitHubJob)();
        (0, syncCoding_job_1.startSyncCodingJob)();
        server.listen(env_1.ENV.PORT, () => {
            console.log(`🚀 Server running on port ${env_1.ENV.PORT}`);
            console.log(`🌍 Frontend URL: ${env_1.ENV.FRONTEND_URL || "not set"}`);
        });
    }
    catch (err) {
        console.error("❌ Boot failed:", err);
        process.exit(1);
    }
};
boot();
