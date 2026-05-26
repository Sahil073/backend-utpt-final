// Polyfill WebSocket for Node.js < 22 (required by Supabase realtime)
import { WebSocket } from "ws";
if (!global.WebSocket) {
  (global as unknown as Record<string, unknown>).WebSocket = WebSocket;
}

import express, { Request, Response, NextFunction } from "express";
import http from "http";
import path from "path";
import fs from "fs";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { Server } from "socket.io";

import { ENV } from "./config/env";
import { connectMongoDB, connectRedis } from "./config/db";

// Models
import "./models/DailySolveLog.model";
import "./models/CommitLog.model";
import "./models/Notification.model";

// Routes
import healthRouter from "./routes/health.routes";
import authRouter from "./routes/auth.routes";
import studentRouter from "./routes/student.routes";
import leaderboardRouter from "./routes/leaderboard.routes";
import notificationRouter from "./routes/notification.routes";
import adminRouter from "./routes/admin.routes";
import resourceRouter from "./routes/resource.routes";
import questionRouter from "./routes/question.routes";

// Jobs
import { startComputeScoresJob } from "./jobs/computeScores.job";
import { startNudgeJob } from "./jobs/nudgePoorPerformers.job";
import { startSyncGitHubJob } from "./jobs/syncGitHub.job";
import { startSyncCodingJob } from "./jobs/syncCoding.job";

// Middleware
import { globalLimiter } from "./middleware/rateLimit.middleware";

// ─────────────────────────────────────────────────────────────
// CORS config — defined ONCE and reused everywhere
// ─────────────────────────────────────────────────────────────
const allowedOrigins = [
  "https://utpt-arivana.netlify.app", // hardcode your Netlify URL
];

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, server-to-server)
    if (!origin) return callback(null, true);

    const isAllowed =
      allowedOrigins.includes(origin) ||
      origin.includes("localhost") ||
      origin.includes("netlify.app") ||
      origin.includes("onrender.com") ||
      origin.includes("replit.dev") ||
      origin.includes("replit.app") ||
      (!!ENV.FRONTEND_URL && origin === ENV.FRONTEND_URL);

    if (isAllowed) {
      return callback(null, true);
    }

    console.error("❌ CORS blocked:", origin);
    return callback(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 200, // Some browsers (IE11) choke on 204
};

const app = express();
const server = http.createServer(app);

app.set("trust proxy", 1);

// ─────────────────────────────────────────────────────────────
// CORS must be the FIRST middleware — before everything else
// The OPTIONS preflight must be handled before helmet, morgan, etc.
// ─────────────────────────────────────────────────────────────
app.use(cors(corsOptions));

// Handle preflight for ALL routes explicitly
// "*" not "*splat" — that was the bug
app.options("*", cors(corsOptions));

// ─────────────────────────────────────────────────────────────
// Socket.IO
// ─────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);

      const isAllowed =
        allowedOrigins.includes(origin!) ||
        origin!.includes("localhost") ||
        origin!.includes("netlify.app") ||
        origin!.includes("onrender.com") ||
        origin!.includes("replit.dev") ||
        origin!.includes("replit.app") ||
        (!!ENV.FRONTEND_URL && origin === ENV.FRONTEND_URL);

      return isAllowed
        ? cb(null, true)
        : cb(new Error(`Socket CORS blocked: ${origin}`));
    },
    credentials: true,
  },
});

app.set("io", io);

// ─────────────────────────────────────────────────────────────
// Frontend Static Hosting (only when public/ folder exists)
// ─────────────────────────────────────────────────────────────
const publicDir = path.join(__dirname, "../public");
const hasPublic = fs.existsSync(publicDir);

if (hasPublic) {
  app.use(express.static(publicDir));
}

// ─────────────────────────────────────────────────────────────
// Core Middleware (after CORS)
// ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan("dev"));
app.use(globalLimiter);

// ─────────────────────────────────────────────────────────────
// API Routes
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
// Socket Events
// ─────────────────────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log("🔌 Connected:", socket.id);

  socket.on("join", ({ userId }: { userId: string }) => {
    socket.join(`user:${userId}`);
  });

  socket.on("joinBatch", ({ batch }: { batch: string }) => {
    socket.join(`batch:${batch}`);
  });

  socket.on("disconnect", () => {
    console.log("🔌 Disconnected:", socket.id);
  });
});

// ─────────────────────────────────────────────────────────────
// 404 + SPA Fallback
// ─────────────────────────────────────────────────────────────
app.use((req: Request, res: Response) => {
  if (req.path.startsWith("/api/") || req.path.startsWith("/health")) {
    return res.status(404).json({
      success: false,
      data: null,
      message: "Route not found",
    });
  }

  if (req.path.includes(".") && hasPublic) {
    return res.status(404).send("Asset not found");
  }

  if (hasPublic) {
    return res.sendFile(path.join(publicDir, "index.html"));
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
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("🔥 Unhandled Error:", err);

  res.status(500).json({
    success: false,
    data: null,
    message:
      ENV.NODE_ENV === "production" ? "Internal server error" : err.message,
  });
});

// ─────────────────────────────────────────────────────────────
// Boot
// ─────────────────────────────────────────────────────────────
const boot = async () => {
  try {
    await connectMongoDB();
    console.log("✅ MongoDB connected");

    await connectRedis();
    console.log("✅ Redis connected");

    startComputeScoresJob();
    startNudgeJob(io);
    startSyncGitHubJob();
    startSyncCodingJob();

    server.listen(ENV.PORT, () => {
      console.log(`🚀 Server running on port ${ENV.PORT}`);
      console.log(`🌍 Frontend URL: ${ENV.FRONTEND_URL || "not set"}`);
    });
  } catch (err) {
    console.error("❌ Boot failed:", err);
    process.exit(1);
  }
};

boot();