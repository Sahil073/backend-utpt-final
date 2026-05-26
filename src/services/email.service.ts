// Email service — SMTP disabled, all functions are no-ops.
// OTP flow has been removed. Login is collegeId + password only.

export const sendOTPEmail = async (
  _toEmail: string,
  _toName: string,
  _otp: string
): Promise<void> => {
  // No-op — OTP system removed
};

export const sendNotificationEmail = async (
  _toEmail: string,
  _toName: string,
  _title: string,
  _body: string
): Promise<void> => {
  // No-op — email sending disabled
};
