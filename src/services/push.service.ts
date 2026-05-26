import admin from "../config/firebase";

export const sendPushNotification = async (
  fcmToken: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<void> => {
  try {
    await admin.messaging().send({
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
  } catch (err) {
    // Don't crash if push fails — token might be stale
    console.error(`❌ Push failed:`, err);
  }
};