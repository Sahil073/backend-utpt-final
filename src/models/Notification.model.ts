import mongoose, { Document, Schema } from "mongoose";

export type NotificationType =
  | "reminder"
  | "achievement"
  | "announcement"
  | "alert";

export interface INotification extends Document {
  user_id: string;       // UUID from Postgres
  title: string;
  body: string;
  type: NotificationType;
  is_read: boolean;
  created_at: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    user_id: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    type: {
      type: String,
      enum: ["reminder", "achievement", "announcement", "alert"],
      required: true,
    },
    is_read: { type: Boolean, default: false },
    created_at: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

NotificationSchema.index({ user_id: 1, is_read: 1, created_at: -1 });

export const Notification = mongoose.model<INotification>(
  "Notification",
  NotificationSchema
);