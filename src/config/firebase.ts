import admin from "firebase-admin";
import { ENV } from "./env";

if (!admin.apps.length) {
  try {
    let serviceAccountValue = ENV.FIREBASE_SERVICE_ACCOUNT;

    // Support JSON string, file path, or base64-encoded JSON
    let serviceAccount: admin.ServiceAccount;
    if (serviceAccountValue.startsWith("{")) {
      // Inline JSON string
      serviceAccount = JSON.parse(serviceAccountValue);
    } else if (serviceAccountValue.startsWith("/") || serviceAccountValue.startsWith("./")) {
      // File path
      const fs = require("fs");
      serviceAccount = JSON.parse(fs.readFileSync(serviceAccountValue, "utf8"));
    } else {
      // Try base64-encoded JSON
      const decoded = Buffer.from(serviceAccountValue, "base64").toString("utf8");
      serviceAccount = JSON.parse(decoded);
    }

    // Fix private_key newlines (Render/Replit ENV issue)
    if ((serviceAccount as any).private_key) {
      (serviceAccount as any).private_key = (serviceAccount as any).private_key.replace(/\\n/g, "\n");
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log("✅ Firebase initialized");
  } catch (err) {
    console.warn("⚠️ Firebase initialization failed (push notifications disabled):", (err as Error).message);
  }
}

export default admin;
