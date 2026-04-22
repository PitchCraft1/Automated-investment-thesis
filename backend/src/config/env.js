import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendEnvPath = path.resolve(__dirname, "../../.env");
const rootEnvPath = path.resolve(__dirname, "../../../.env");

if (fs.existsSync(backendEnvPath)) {
  dotenv.config({ path: backendEnvPath });
}

if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath, override: true });
}

function requiredIfEnabled(value, label, enabled) {
  if (enabled && !value) {
    throw new Error(`${label} is required when the related integration is enabled.`);
  }
  return value || "";
}

function normalizeUrl(value, fallback) {
  const normalized = String(value || fallback || "").trim();
  return normalized.replace(/\/+$/, "");
}

function buildCallbackUrl(explicitUrl, appBaseUrl, callbackPath) {
  const normalizedExplicitUrl = String(explicitUrl || "").trim();
  if (normalizedExplicitUrl) {
    return normalizedExplicitUrl;
  }

  return `${normalizeUrl(appBaseUrl, "http://localhost:4000")}${callbackPath}`;
}

const appBaseUrl = normalizeUrl(process.env.APP_BASE_URL, "http://localhost:4000");
const publicAppBaseUrl = normalizeUrl(process.env.PUBLIC_APP_BASE_URL, appBaseUrl);
const frontendUrl = normalizeUrl(process.env.FRONTEND_URL, "http://localhost:5173");

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 4000),
  appBaseUrl,
  publicAppBaseUrl,
  frontendUrl,
  jwtSecret: process.env.JWT_SECRET || "change-me",
  sessionSecret: process.env.SESSION_SECRET || "change-me-session",
  databaseUrl: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/investment_thesis",
  maxUploadsPerHour: Number(process.env.MAX_UPLOADS_PER_HOUR || 5),
  groqApiUrl: process.env.GROQ_API_URL || "https://api.groq.com/openai/v1/chat/completions",
  groqApiKey: process.env.GROQ_API_KEY,
  groqModel: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
  requireLlmAnalysis: String(process.env.REQUIRE_LLM_ANALYSIS || "false").toLowerCase() === "true",
  awsRegion: process.env.AWS_REGION || "ap-south-1",
  s3BucketName: process.env.S3_BUCKET_NAME || "",
  s3AccessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
  s3SecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  s3SessionToken: process.env.AWS_SESSION_TOKEN || "",
  emailEnabled: String(process.env.EMAIL_ENABLED || "false").toLowerCase() === "true",
  smtp: {
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "false").toLowerCase() === "true",
    user: process.env.SMTP_USER || "",
    pass: normalizeSmtpPassword(process.env.SMTP_PASS || "", process.env.SMTP_HOST || ""),
    from: process.env.SMTP_FROM || "no-reply@pitchdeckanalyzer.local"
  },
  oauth: {
    google: {
      enabled: String(process.env.GOOGLE_OAUTH_ENABLED || "false").toLowerCase() === "true",
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      callbackUrl: buildCallbackUrl(process.env.GOOGLE_CALLBACK_URL, appBaseUrl, "/api/auth/google/callback")
    },
    linkedin: {
      enabled: String(process.env.LINKEDIN_OAUTH_ENABLED || "false").toLowerCase() === "true",
      clientId: process.env.LINKEDIN_CLIENT_ID || "",
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET || "",
      callbackUrl: buildCallbackUrl(process.env.LINKEDIN_CALLBACK_URL, appBaseUrl, "/api/auth/linkedin/callback")
    }
  }
};

function normalizeSmtpPassword(password, host) {
  const normalized = String(password || "").trim();

  // Gmail app passwords are often copied with spaces for readability.
  if (String(host || "").toLowerCase() === "smtp.gmail.com") {
    return normalized.replace(/\s+/g, "");
  }

  return normalized;
}

requiredIfEnabled(env.groqApiKey, "GROQ_API_KEY", env.requireLlmAnalysis);
requiredIfEnabled(env.smtp.host, "SMTP_HOST", env.emailEnabled);
requiredIfEnabled(env.smtp.user, "SMTP_USER", env.emailEnabled);
requiredIfEnabled(env.smtp.pass, "SMTP_PASS", env.emailEnabled);
requiredIfEnabled(env.oauth.google.clientId, "GOOGLE_CLIENT_ID", env.oauth.google.enabled);
requiredIfEnabled(env.oauth.google.clientSecret, "GOOGLE_CLIENT_SECRET", env.oauth.google.enabled);
requiredIfEnabled(env.oauth.linkedin.clientId, "LINKEDIN_CLIENT_ID", env.oauth.linkedin.enabled);
requiredIfEnabled(env.oauth.linkedin.clientSecret, "LINKEDIN_CLIENT_SECRET", env.oauth.linkedin.enabled);
