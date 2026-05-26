import mongoose, { Document, Schema } from "mongoose";

export interface ICommit {
  sha: string;
  repo: string;
  message: string;
  type: "code" | "trivial";
  date: string;
}

export interface ICommitLog extends Document {
  user_id: string;       // UUID from Postgres
  synced_at: Date;
  commits: ICommit[];
}

const CommitSchema = new Schema<ICommit>(
  {
    sha: { type: String, required: true },
    repo: { type: String, required: true },
    message: { type: String, required: true },
    type: { type: String, enum: ["code", "trivial"], required: true },
    date: { type: String, required: true },
  },
  { _id: false }
);

const CommitLogSchema = new Schema<ICommitLog>(
  {
    user_id: { type: String, required: true },
    synced_at: { type: Date, default: Date.now },
    commits: { type: [CommitSchema], default: [] },
  },
  { timestamps: false }
);

CommitLogSchema.index({ user_id: 1, synced_at: -1 });

export const CommitLog = mongoose.model<ICommitLog>(
  "CommitLog",
  CommitLogSchema
);