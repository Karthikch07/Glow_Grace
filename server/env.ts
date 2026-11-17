import fs from "fs";
import path from "path";

// Load .env before anything else reads process.env. Values already present in
// the real environment win, so hosting providers can override the file.
const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath) && typeof process.loadEnvFile === "function") {
  process.loadEnvFile(envPath);
}

export const isProduction = process.env.NODE_ENV === "production";

function readSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (isProduction) {
    throw new Error("SESSION_SECRET must be set to at least 32 characters in production.");
  }
  if (!secret) console.warn("[env] SESSION_SECRET not set; using an insecure development secret.");
  return secret || "glowgrace-insecure-development-secret-change-me";
}

export const env = {
  port: parseInt(process.env.PORT || "5000", 10),
  host: process.env.HOST,
  mongoUri: process.env.MONGODB_URI || "mongodb://localhost:27017/glowgrace",
  jwtSecret: readSecret(),
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || "",
  /**
   * In development the client has demo sign-in fallbacks that never produce a
   * Firebase ID token. Production always requires a verified token.
   */
  allowUnverifiedFirebaseSync: !isProduction && process.env.ALLOW_UNVERIFIED_FIREBASE_SYNC !== "false",
  adminEmails: (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
  upiId: process.env.UPI_ID || "",
  /** Minutes an unpaid UPI order holds its stock before it is released. */
  unpaidOrderTtlMinutes: parseInt(process.env.UNPAID_ORDER_TTL_MINUTES || "30", 10),
};
