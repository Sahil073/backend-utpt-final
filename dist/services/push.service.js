"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendPushNotification = void 0;
const firebase_1 = __importDefault(require("../config/firebase"));
const sendPushNotification = async (fcmToken, title, body, data) => {
    try {
        await firebase_1.default.messaging().send({
            token: fcmToken,
            notification: { title, body },
            data: data || {},
            android: {
                priority: "high",
                notification: { sound: "default" },
            },
            apns: {
                payload: {
                    aps: { sound: "default", badge: 1 },
                },
            },
        });
        console.log(`✅ Push sent to token: ${fcmToken.slice(0, 20)}...`);
    }
    catch (err) {
        // Don't crash if push fails — token might be stale
        console.error(`❌ Push failed:`, err);
    }
};
exports.sendPushNotification = sendPushNotification;
