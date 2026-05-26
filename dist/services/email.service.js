"use strict";
// Email service — SMTP disabled, all functions are no-ops.
// OTP flow has been removed. Login is collegeId + password only.
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendNotificationEmail = exports.sendOTPEmail = void 0;
const sendOTPEmail = async (_toEmail, _toName, _otp) => {
    // No-op — OTP system removed
};
exports.sendOTPEmail = sendOTPEmail;
const sendNotificationEmail = async (_toEmail, _toName, _title, _body) => {
    // No-op — email sending disabled
};
exports.sendNotificationEmail = sendNotificationEmail;
