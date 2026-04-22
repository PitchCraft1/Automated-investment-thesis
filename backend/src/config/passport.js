import passport from "passport";
import axios from "axios";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as OAuth2Strategy } from "passport-oauth2";
import { env } from "./env.js";
import { findOrCreateOAuthUser } from "../services/authService.js";

const linkedInAuthorizationUrl = "https://www.linkedin.com/oauth/v2/authorization";
const linkedInTokenUrl = "https://www.linkedin.com/oauth/v2/accessToken";
const linkedInUserInfoUrl = "https://api.linkedin.com/v2/userinfo";

class LinkedInOidcStrategy extends OAuth2Strategy {
  constructor(options, verify) {
    super(
      {
        authorizationURL: linkedInAuthorizationUrl,
        tokenURL: linkedInTokenUrl,
        scope: ["openid", "profile", "email"],
        state: true,
        ...options
      },
      verify
    );

    this.name = "linkedin";
  }

  authorizationParams(options) {
    const params = {};

    if (options?.prompt) {
      params.prompt = options.prompt;
    }

    if (options?.enableExtendedLogin) {
      params.enable_extended_login = "true";
    }

    return params;
  }

  async userProfile(accessToken, done) {
    try {
      const { data } = await axios.get(linkedInUserInfoUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`
        },
        timeout: 10000
      });

      done(null, mapLinkedInOidcProfile(data));
    } catch (error) {
      done(error);
    }
  }
}

function mapLinkedInOidcProfile(data) {
  const givenName = String(data?.given_name || "").trim();
  const familyName = String(data?.family_name || "").trim();
  const displayName = String(data?.name || `${givenName} ${familyName}`.trim() || "LinkedIn User").trim();
  const email = String(data?.email || "").trim().toLowerCase();
  const picture = String(data?.picture || "").trim();

  return {
    provider: "linkedin",
    id: String(data?.sub || "").trim(),
    displayName,
    name: {
      givenName,
      familyName
    },
    emails: email ? [{ value: email }] : [],
    photos: picture ? [{ value: picture }] : [],
    _json: data,
    _raw: JSON.stringify(data)
  };
}

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => done(null, { id }));

if (env.oauth.google.enabled) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: env.oauth.google.clientId,
        clientSecret: env.oauth.google.clientSecret,
        callbackURL: env.oauth.google.callbackUrl
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const user = await findOrCreateOAuthUser({
            provider: "google",
            subject: profile.id,
            email: profile.emails?.[0]?.value,
            name: profile.displayName
          });
          done(null, user);
        } catch (error) {
          done(error);
        }
      }
    )
  );
}

if (env.oauth.linkedin.enabled) {
  passport.use(
    new LinkedInOidcStrategy(
      {
        clientID: env.oauth.linkedin.clientId,
        clientSecret: env.oauth.linkedin.clientSecret,
        callbackURL: env.oauth.linkedin.callbackUrl
      },
      async (_accessToken, _refreshToken, _params, profile, done) => {
        try {
          const user = await findOrCreateOAuthUser({
            provider: "linkedin",
            subject: profile.id,
            email: profile.emails?.[0]?.value,
            name: profile.displayName
          });
          done(null, user);
        } catch (error) {
          done(error);
        }
      }
    )
  );
}

export { passport };
