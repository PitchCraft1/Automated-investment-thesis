import cors from "cors";
import express from "express";
import session from "express-session";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import authRoutes from "./routes/authRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";
import { env } from "./config/env.js";
import { passport } from "./config/passport.js";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(morgan("dev"));
  app.use(
    cors({
      origin: env.frontendUrl,
      credentials: true
    })
  );
  app.use(express.json({ limit: "2mb" }));
  app.use(
    session({
      secret: env.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: env.nodeEnv === "production",
        httpOnly: true,
        sameSite: "lax"
      }
    })
  );
  app.use(passport.initialize());

  app.use(
    "/api/reports/upload",
    rateLimit({
      windowMs: 60 * 60 * 1000,
      max: env.maxUploadsPerHour,
      standardHeaders: true,
      legacyHeaders: false,
      message: { message: `Upload limit exceeded. Maximum ${env.maxUploadsPerHour} uploads per hour.` }
    })
  );

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "investment-thesis-backend",
      timestamp: new Date().toISOString()
    });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/reports", reportRoutes);

  app.use((error, _req, res, _next) => {
    res.status(500).json({
      message: error.message || "Internal server error."
    });
  });

  return app;
}

