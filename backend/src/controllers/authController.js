import { createAuthResponse, issueToken, loginUser, registerUser } from "../services/authService.js";
import { env } from "../config/env.js";

export async function register(req, res) {
  try {
    const result = await registerUser(req.body);
    res.status(201).json(result);
  } catch (error) {
    res.status(error.statusCode || 400).json({ message: error.message || "Unable to register user." });
  }
}

export async function login(req, res) {
  try {
    const result = await loginUser(req.body);
    res.json(result);
  } catch (error) {
    res.status(error.statusCode || 400).json({ message: error.message || "Unable to login." });
  }
}

export function me(req, res) {
  res.json({
    user: {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email
    }
  });
}

export function oauthSuccess(req, res) {
  const token = issueToken(req.user);
  const redirectUrl = new URL(env.frontendUrl);
  redirectUrl.searchParams.set("token", token);
  redirectUrl.searchParams.set("name", req.user.name || "");
  redirectUrl.searchParams.set("email", req.user.email || "");
  res.redirect(redirectUrl.toString());
}

export function oauthFailure(_req, res) {
  res.redirect(`${env.frontendUrl}?oauth_error=1`);
}

export function authProviders(_req, res) {
  res.json({
    google: env.oauth.google.enabled,
    linkedin: env.oauth.linkedin.enabled
  });
}
