"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const firebase_admin_1 = __importDefault(require("firebase-admin"));
const env_1 = require("./env");
if (!firebase_admin_1.default.apps.length) {
    try {
        let serviceAccountValue = env_1.ENV.FIREBASE_SERVICE_ACCOUNT;
        // Support JSON string, file path, or base64-encoded JSON
        let serviceAccount;
        if (serviceAccountValue.startsWith("{")) {
            // Inline JSON string
            serviceAccount = JSON.parse(serviceAccountValue);
        }
        else if (serviceAccountValue.startsWith("/") || serviceAccountValue.startsWith("./")) {
            // File path
            const fs = require("fs");
            serviceAccount = JSON.parse(fs.readFileSync(serviceAccountValue, "utf8"));
        }
        else {
            // Try base64-encoded JSON
            const decoded = Buffer.from(serviceAccountValue, "base64").toString("utf8");
            serviceAccount = JSON.parse(decoded);
        }
        // Fix private_key newlines (Render/Replit ENV issue)
        if (serviceAccount.private_key) {
            serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
        }
        firebase_admin_1.default.initializeApp({
            credential: firebase_admin_1.default.credential.cert(serviceAccount),
        });
        console.log("✅ Firebase initialized");
    }
    catch (err) {
        console.warn("⚠️ Firebase initialization failed (push notifications disabled):", err.message);
    }
}
exports.default = firebase_admin_1.default;
