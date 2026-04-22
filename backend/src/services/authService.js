import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { env } from "../config/env.js";
import { query } from "../db/client.js";

const registrationSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6)
});

const loginSchema = registrationSchema.pick({ email: true, password: true });
const reportDownloadTokenTtl = "7d";

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function buildDuplicateUserError(message = "A user with this email already exists.") {
  const error = new Error(message);
  error.statusCode = 409;
  return error;
}

export async function registerUser(payload) {
  const parsed = registrationSchema.parse(payload);
  const normalizedEmail = normalizeEmail(parsed.email);
  const existing = await findUserByEmail(normalizedEmail);

  if (existing) {
    throw buildDuplicateUserError(
      existing.authProvider === "local"
        ? "A user with this email already exists."
        : `A user with this email already exists and was created with ${existing.authProvider}. Please sign in using that method.`
    );
  }

  const passwordHash = await bcrypt.hash(parsed.password, 10);
  const user = {
    id: uuidv4(),
    name: parsed.name,
    email: normalizedEmail,
    passwordHash,
    authProvider: "local"
  };

  try {
    await query(
      `INSERT INTO app_user (id, name, email, password_hash, auth_provider)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, user.name, user.email, user.passwordHash, user.authProvider]
    );
  } catch (error) {
    if (error?.code === "23505") {
      throw buildDuplicateUserError("A user with this email already exists.");
    }
    throw error;
  }

  return createAuthResponse(user);
}

export async function loginUser(payload) {
  const parsed = loginSchema.parse(payload);
  const user = await findUserByEmail(parsed.email);

  if (!user) {
    throw new Error("Invalid email or password.");
  }

  if (!user.passwordHash) {
    throw new Error(`This account was created with ${user.authProvider}. Please sign in using that method.`);
  }

  const isValid = await bcrypt.compare(parsed.password, user.passwordHash);
  if (!isValid) {
    throw new Error("Invalid email or password.");
  }

  return createAuthResponse(user);
}

export async function findUserByEmail(email) {
  const result = await query(
    `SELECT id, name, email, password_hash AS "passwordHash", auth_provider AS "authProvider", oauth_subject AS "oauthSubject"
     FROM app_user
     WHERE LOWER(email) = LOWER($1)`,
    [normalizeEmail(email)]
  );

  return result.rows[0] || null;
}

export async function findUserById(id) {
  const result = await query(
    `SELECT id, name, email, password_hash AS "passwordHash", auth_provider AS "authProvider", oauth_subject AS "oauthSubject"
     FROM app_user
     WHERE id = $1`,
    [id]
  );

  return result.rows[0] || null;
}

export async function findOrCreateOAuthUser({ provider, subject, email, name }) {
  const existing = await query(
    `SELECT id, name, email, password_hash AS "passwordHash", auth_provider AS "authProvider", oauth_subject AS "oauthSubject"
     FROM app_user
     WHERE auth_provider = $1 AND oauth_subject = $2`,
    [provider, subject]
  );

  if (existing.rows[0]) {
    return existing.rows[0];
  }

  const emailUser = email ? await findUserByEmail(email) : null;
  if (emailUser) {
    return emailUser;
  }

  const user = {
    id: uuidv4(),
    name: name || `${provider} user`,
    email: (email || `${provider}-${subject}@oauth.local`).toLowerCase(),
    authProvider: provider,
    oauthSubject: subject
  };

  try {
    await query(
      `INSERT INTO app_user (id, name, email, auth_provider, oauth_subject)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, user.name, user.email, user.authProvider, user.oauthSubject]
    );
  } catch (error) {
    if (error?.code === "23505") {
      throw buildDuplicateUserError("A user with this email already exists. Please log in using your original sign-in method.");
    }
    throw error;
  }

  return user;
}

export function issueToken(user) {
  return jwt.sign({ userId: user.id }, env.jwtSecret, { expiresIn: "24h" });
}

export function issueReportDownloadToken({ reportId, userId }) {
  return jwt.sign(
    {
      type: "report-download",
      reportId,
      userId
    },
    env.jwtSecret,
    { expiresIn: reportDownloadTokenTtl }
  );
}

export function verifyReportDownloadToken(token) {
  const payload = jwt.verify(token, env.jwtSecret);

  if (payload?.type !== "report-download" || !payload.reportId || !payload.userId) {
    throw new Error("Invalid report download token.");
  }

  return {
    reportId: payload.reportId,
    userId: payload.userId
  };
}

export function createAuthResponse(user) {
  return {
    token: issueToken(user),
    user: {
      id: user.id,
      name: user.name,
      email: user.email
    }
  };
}
