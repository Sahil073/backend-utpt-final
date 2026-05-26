import { Notification } from "../models/Notification.model";
import { sendPushNotification } from "./push.service";
import { supabase } from "../config/db";

export type NotificationTarget =
  | { type: "user";  userId: string }
  | { type: "batch"; batch: string  }
  | { type: "all"                   };

interface SendNotificationOptions {
  title:       string;
  body:        string;
  notifType:   "reminder" | "achievement" | "announcement" | "alert";
  sendEmail?:  boolean;
  sendPush?:   boolean;
  io?:         any; // Socket.io server instance
}

// ─── Send to a single user ───────────────────────────────────
export const sendToUser = async (
  userId: string,
  opts: SendNotificationOptions
): Promise<void> => {
  // Save to MongoDB
  await Notification.create({
    user_id:    userId,
    title:      opts.title,
    body:       opts.body,
    type:       opts.notifType,
    is_read:    false,
    created_at: new Date(),
  });

  // Fetch user for email + FCM token
  const { data: user } = await supabase
    .from("users")
    .select("name, email, fcm_token")
    .eq("id", userId)
    .single();

  if (!user) return;

  // Socket.io — real time
  if (opts.io) {
    opts.io.to(`user:${userId}`).emit("notification:new", {
      title: opts.title,
      body:  opts.body,
      type:  opts.notifType,
    });
  }

  // Push notification
  if (opts.sendPush && user.fcm_token) {
    await sendPushNotification(user.fcm_token, opts.title, opts.body);
  }
};

// ─── Send to all users in a batch ───────────────────────────
export const sendToBatch = async (
  batch: string,
  opts: SendNotificationOptions
): Promise<void> => {
  const { data: users } = await supabase
    .from("users")
    .select("id")
    .eq("batch", batch)
    .eq("is_active", true);

  if (!users) return;

  for (const user of users) {
    await sendToUser(user.id, opts);
  }
};

// ─── Send to all active students ────────────────────────────
export const sendToAll = async (
  opts: SendNotificationOptions
): Promise<void> => {
  const { data: users } = await supabase
    .from("users")
    .select("id")
    .eq("is_active", true);

  if (!users) return;

  for (const user of users) {
    await sendToUser(user.id, opts);
  }
};