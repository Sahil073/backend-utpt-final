import dotenv from "dotenv";
dotenv.config();

const required = (key: string): string => {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env variable: ${key}`);
  return val;
};

const optional = (key: string, fallback = ""): string =>
  process.env[key] || fallback;

export const ENV = {
  PORT:         optional("PORT", "5000"),
  NODE_ENV:     optional("NODE_ENV", "development"),
  FRONTEND_URL: optional("FRONTEND_URL", "http://localhost:5173"),

  JWT_SECRET:         required("JWT_SECRET"),
  JWT_REFRESH_SECRET: required("JWT_REFRESH_SECRET"),
  JWT_SETUP_SECRET:   optional("JWT_SETUP_SECRET"),

  SUPABASE_URL:         required("SUPABASE_URL"),
  SUPABASE_SERVICE_KEY: required("SUPABASE_SERVICE_KEY"),
  SUPABASE_ANON_KEY:    optional("SUPABASE_ANON_KEY"),

  MONGODB_URI: required("MONGODB_URI"),
  REDIS_URL:   required("REDIS_URL"),

  // Brevo SMTP — optional, emails disabled if not set
  BREVO_SMTP_USER:    optional("BREVO_SMTP_USER"),
  BREVO_SMTP_PASS:    optional("BREVO_SMTP_PASS"),
  BREVO_SENDER_EMAIL: optional("BREVO_SENDER_EMAIL"),

  CLOUDINARY_CLOUD_NAME: required("CLOUDINARY_CLOUD_NAME"),
  CLOUDINARY_API_KEY:    required("CLOUDINARY_API_KEY"),
  CLOUDINARY_API_SECRET: required("CLOUDINARY_API_SECRET"),

  GITHUB_TOKEN: required("GITHUB_TOKEN"),

  FIREBASE_SERVICE_ACCOUNT: optional("FIREBASE_SERVICE_ACCOUNT"),
};