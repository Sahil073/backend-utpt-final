import mongoose, { Document, Schema } from "mongoose";

export interface IProblem {
  id: string;
  platform: "leetcode" | "codeforces";
  difficulty: "easy" | "medium" | "hard";
}

export interface IDailySolveLog extends Document {
  user_id: string;       // UUID from Postgres
  date: string;          // "2026-04-28"
  lc_solved: number;
  cf_solved: number;
  total_solved: number;
  problems: IProblem[];
}

const ProblemSchema = new Schema<IProblem>(
  {
    id: { type: String, required: true },
    platform: { type: String, enum: ["leetcode", "codeforces"], required: true },
    difficulty: { type: String, enum: ["easy", "medium", "hard"], required: true },
  },
  { _id: false }
);

const DailySolveLogSchema = new Schema<IDailySolveLog>(
  {
    user_id: { type: String, required: true },
    date: { type: String, required: true },      // "YYYY-MM-DD"
    lc_solved: { type: Number, default: 0 },
    cf_solved: { type: Number, default: 0 },
    total_solved: { type: Number, default: 0 },
    problems: { type: [ProblemSchema], default: [] },
  },
  { timestamps: false }
);

// One document per user per day
DailySolveLogSchema.index({ user_id: 1, date: -1 });

export const DailySolveLog = mongoose.model<IDailySolveLog>(
  "DailySolveLog",
  DailySolveLogSchema
);