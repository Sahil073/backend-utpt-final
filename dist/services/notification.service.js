"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendToAll = exports.sendToBatch = exports.sendToUser = void 0;
const Notification_model_1 = require("../models/Notification.model");
const push_service_1 = require("./push.service");
const db_1 = require("../config/db");
// ─── Send to a single user ───────────────────────────────────
const sendToUser = async (userId, opts) => {
    // Save to MongoDB
    await Notification_model_1.Notification.create({
        user_id: userId,
        title: opts.title,
        body: opts.body,
        type: opts.notifType,
        is_read: false,
        created_at: new Date(),
    });
    // Fetch user for email + FCM token
    const { data: user } = await db_1.supabase
        .from("users")
        .select("name, email, fcm_token")
        .eq("id", userId)
        .single();
    if (!user)
        return;
    // Socket.io — real time
    if (opts.io) {
        opts.io.to(`user:${userId}`).emit("notification:new", {
            title: opts.title,
            body: opts.body,
            type: opts.notifType,
        });
    }
    // Push notification
    if (opts.sendPush && user.fcm_token) {
        await (0, push_service_1.sendPushNotification)(user.fcm_token, opts.title, opts.body);
    }
};
exports.sendToUser = sendToUser;
// ─── Send to all users in a batch ───────────────────────────
const sendToBatch = async (batch, opts) => {
    const { data: users } = await db_1.supabase
        .from("users")
        .select("id")
        .eq("batch", batch)
        .eq("is_active", true);
    if (!users)
        return;
    for (const user of users) {
        await (0, exports.sendToUser)(user.id, opts);
    }
};
exports.sendToBatch = sendToBatch;
// ─── Send to all active students ────────────────────────────
const sendToAll = async (opts) => {
    const { data: users } = await db_1.supabase
        .from("users")
        .select("id")
        .eq("is_active", true);
    if (!users)
        return;
    for (const user of users) {
        await (0, exports.sendToUser)(user.id, opts);
    }
};
exports.sendToAll = sendToAll;
