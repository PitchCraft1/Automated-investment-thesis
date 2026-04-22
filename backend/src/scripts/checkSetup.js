import { env } from "../config/env.js";
import { query, pool } from "../db/client.js";

async function main() {
  const checks = [];

  try {
    await query("SELECT NOW()");
    checks.push(["PostgreSQL", "OK", env.databaseUrl]);
  } catch (error) {
    checks.push(["PostgreSQL", "FAIL", error.message]);
  }

  checks.push([
    "Groq API Key",
    env.groqApiKey ? "OK" : "MISSING",
    env.groqApiKey ? "Configured" : "Set GROQ_API_KEY in backend/.env"
  ]);

  checks.push([
    "Groq Endpoint",
    env.groqApiUrl ? "OK" : "MISSING",
    env.groqApiUrl || "Set GROQ_API_URL in backend/.env"
  ]);

  checks.push([
    "Groq Model",
    env.groqModel ? "OK" : "MISSING",
    env.groqModel || "Set GROQ_MODEL in backend/.env"
  ]);

  checks.push([
    "S3 Storage",
    env.s3BucketName && env.s3AccessKeyId && env.s3SecretAccessKey ? "OK" : "OPTIONAL",
    env.s3BucketName ? env.s3BucketName : "Will use local artifact storage until configured"
  ]);

  checks.push([
    "SMTP Email",
    env.emailEnabled ? "ENABLED" : "DISABLED",
    env.emailEnabled ? env.smtp.host || "Missing SMTP host" : "Email notifications disabled"
  ]);

  checks.push([
    "Google OAuth",
    env.oauth.google.enabled ? "ENABLED" : "DISABLED",
    env.oauth.google.enabled ? env.oauth.google.callbackUrl : "Google OAuth disabled"
  ]);

  checks.push([
    "LinkedIn OAuth",
    env.oauth.linkedin.enabled ? "ENABLED" : "DISABLED",
    env.oauth.linkedin.enabled ? env.oauth.linkedin.callbackUrl : "LinkedIn OAuth disabled"
  ]);

  console.log("\nSetup Status\n");
  for (const [name, status, detail] of checks) {
    console.log(`${name}: ${status}`);
    console.log(`  ${detail}`);
  }

  await pool.end();
}

main().catch(async (error) => {
  console.error("Setup check failed:", error);
  await pool.end();
  process.exit(1);
});
