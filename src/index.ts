import { WebSocket } from "ws";
if (!global.WebSocket) {
  (global as unknown as Record<string, unknown>).WebSocket = WebSocket;
}

import express, { Request, Response, NextFunction } from "express";
import http from "http";
import path from "path";
import fs from "fs";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { Server } from "socket.io";

import { ENV } from "./config/env";
import { connectMongoDB, connectRedis } from "./config/db";

import "./models/DailySolveLog.model";
import "./models/CommitLog.model";
import "./models/Notification.model";

import healthRouter from "./routes/health.routes";
import authRouter from "./routes/auth.routes";
import studentRouter from "./routes/student.routes";
import leaderboardRouter from "./routes/leaderboard.routes";
import notificationRouter from "./routes/notification.routes";
import adminRouter from "./routes/admin.routes";
import resourceRouter from "./routes/resource.routes";
import questionRouter from "./routes/question.routes";

import { startComputeScoresJob } from "./jobs/computeScores.job";
import { startNudgeJob } from "./jobs/nudgePoorPerformers.job";
import { startSyncGitHubJob } from "./jobs/syncGitHub.job";
import { startSyncCodingJob } from "./jobs/syncCoding.job";

import { globalLimiter } from "./middleware/rateLimit.middleware";

const app = express();
const server = http.createServer(app);

app.set("trust proxy", 1);

// ─────────────────────────────────────────────────────────────
// CORS — raw manual middleware, fires before EVERYTHING
// This is the only reliable way across Express 4/5 + Render
// ─────────────────────────────────────────────────────────────
app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin || "";

  const isAllowed =
    !origin ||                                         // no origin = server/Postman
    origin === "https://utpt-arivana.netlify.app" ||  // your exact frontend
    origin.includes("localhost") ||
    origin.includes("netlify.app") ||
    origin.includes("onrender.com") ||
    origin.includes("replit.dev") ||
    origin.includes("replit.app") ||
    (!!ENV.FRONTEND_URL && origin === ENV.FRONTEND_URL);

  if (isAllowed && origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With"
  );
  res.setHeader("Access-Control-Max-Age", "86400");

  // Preflight — respond immediately, skip all other middleware
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  next();
});

// ─────────────────────────────────────────────────────────────
// Socket.IO
// ─────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      const ok =
        origin === "https://utpt-arivana.netlify.app" ||
        origin.includes("localhost") ||
        origin.includes("netlify.app") ||
        origin.includes("onrender.com") ||
        origin.includes("replit.dev") ||
        origin.includes("replit.app") ||
        (!!ENV.FRONTEND_URL && origin === ENV.FRONTEND_URL);
      return ok ? cb(null, true) : cb(new Error(`Socket CORS blocked: ${origin}`));
    },
    credentials: true,
  },
});

app.set("io", io);

// ─────────────────────────────────────────────────────────────
// Static frontend (only when public/ exists)
// ─────────────────────────────────────────────────────────────
const publicDir = path.join(__dirname, "../public");
const hasPublic = fs.existsSync(publicDir);
if (hasPublic) {
  app.use(express.static(publicDir));
}

// ─────────────────────────────────────────────────────────────
// Core middleware (after CORS)
// ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan("dev"));
app.use(globalLimiter);

// ─────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────
app.use("/health", healthRouter);
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/students", studentRouter);
app.use("/api/v1/leaderboard", leaderboardRouter);
app.use("/api/v1/notifications", notificationRouter);
app.use("/api/v1/admin", adminRouter);
app.use("/api/v1/resources", resourceRouter);
app.use("/api/v1/questions", questionRouter);

// ─────────────────────────────────────────────────────────────
// Socket events
// ─────────────────────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log("🔌 Connected:", socket.id);
  socket.on("join", ({ userId }: { userId: string }) => socket.join(`user:${userId}`));
  socket.on("joinBatch", ({ batch }: { batch: string }) => socket.join(`batch:${batch}`));
  socket.on("disconnect", () => console.log("🔌 Disconnected:", socket.id));
});

// ─────────────────────────────────────────────────────────────
// 404 + SPA fallback
// ─────────────────────────────────────────────────────────────
app.use((req: Request, res: Response) => {
  if (req.path.startsWith("/api/") || req.path.startsWith("/health")) {
    return res.status(404).json({ success: false, data: null, message: "Route not found" });
  }
  if (req.path.includes(".") && hasPublic) {
    return res.status(404).send("Asset not found");
  }
  if (hasPublic) {
    return res.sendFile(path.join(publicDir, "index.html"));
  }
  return res.status(200).json({ success: true, data: null, message: "UTPT API running" });
});

// ─────────────────────────────────────────────────────────────
// Global error handler
// ─────────────────────────────────────────────────────────────
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("🔥 Unhandled Error:", err.message);
  res.status(500).json({
    success: false,
    data: null,
    message: ENV.NODE_ENV === "production" ? "Internal server error" : err.message,
  });
});

// ─────────────────────────────────────────────────────────────
// Boot
// ─────────────────────────────────────────────────────────────
const boot = async () => {
  try {
    await connectMongoDB();
    await connectRedis();

    startComputeScoresJob();
    startNudgeJob(io);
    startSyncGitHubJob();
    startSyncCodingJob();

    server.listen(ENV.PORT, () => {
      console.log(`🚀 Server running on port ${ENV.PORT}`);
      console.log(`🌍 Frontend: ${ENV.FRONTEND_URL || "not set"}`);
    });
  } catch (err) {
    console.error("❌ Boot failed:", err);
    process.exit(1);
  }
};

boot();