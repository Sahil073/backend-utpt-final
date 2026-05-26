import { Request, Response } from "express";
import { Notification } from "../models/Notification.model";
import { supabase } from "../config/db";

// ────────────────────────────────────────────────────────────
// GET /notifications
// Query: ?page=1&unread=true
// ────────────────────────────────────────────────────────────
export const getMyNotifications = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId   = req.user!.id;
    const page     = parseInt((req.query.page  as string) || "1");
    const unread   = req.query.unread === "true";
    const limit    = 20;
    const skip     = (page - 1) * limit;

    const filter: Record<string, any> = { user_id: userId };
    if (unread) filter.is_read = false;

    const [notifications, total] = await Promise.all([
      Notification.find(filter)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Notification.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data:    { notifications, total, page },
      message: "Notifications fetched",
    });
  } catch (err) {
    console.error("getMyNotifications error:", err);
    res.status(500).json({ success: false, data: null, message: "Internal server error" });
  }
};

// ────────────────────────────────────────────────────────────
// PATCH /notifications/:id/read
// ────────────────────────────────────────────────────────────
export const markOneRead = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    await Notification.findOneAndUpdate(
      { _id: id, user_id: userId },
      { $set: { is_read: true } }
    );

    res.status(200).json({
      success: true,
      data:    null,
      message: "Notification marked as read",
    });
  } catch (err) {
    console.error("markOneRead error:", err);
    res.status(500).json({ success: false, data: null, message: "Internal server error" });
  }
};

// ────────────────────────────────────────────────────────────
// PATCH /notifications/read-all
// ────────────────────────────────────────────────────────────
export const markAllRead = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user!.id;

    await Notification.updateMany(
      { user_id: userId, is_read: false },
      { $set: { is_read: true } }
    );

    res.status(200).json({
      success: true,
      data:    null,
      message: "All notifications marked as read",
    });
  } catch (err) {
    console.error("markAllRead error:", err);
    res.status(500).json({ success: false, data: null, message: "Internal server error" });
  }
};

// ────────────────────────────────────────────────────────────
// PUT /students/me/fcm-token
// Body: { fcmToken }
// ────────────────────────────────────────────────────────────
export const saveFcmToken = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId   = req.user!.id;
    const { fcmToken } = req.body;

    if (!fcmToken) {
      res.status(400).json({
        success: false,
        data:    null,
        message: "fcmToken is required",
      });
      return;
    }

    await supabase
      .from("users")
      .update({ fcm_token: fcmToken })
      .eq("id", userId);

    res.status(200).json({
      success: true,
      data:    null,
      message: "FCM token saved",
    });
  } catch (err) {
    console.error("saveFcmToken error:", err);
    res.status(500).json({ success: false, data: null, message: "Internal server error" });
  }
};