import { query } from "./client.js";

export async function initDatabase() {
  await query(`
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS app_user (
      id UUID PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash TEXT,
      auth_provider VARCHAR(40) NOT NULL DEFAULT 'local',
      oauth_subject VARCHAR(255),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_app_user_provider_subject
    ON app_user (auth_provider, oauth_subject)
    WHERE oauth_subject IS NOT NULL;
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS investment_report (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
      startup_name VARCHAR(255),
      file_name VARCHAR(255) NOT NULL,
      status VARCHAR(30) NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0,
      recommendation VARCHAR(20),
      overall_score INTEGER,
      confidence_score INTEGER,
      executive_summary TEXT,
      processing_date_utc VARCHAR(40),
      categories JSONB,
      strengths JSONB,
      weaknesses JSONB,
      recommendations TEXT,
      slide_count INTEGER,
      detected_slide_types JSONB,
      source_storage_provider VARCHAR(20),
      source_storage_key TEXT,
      source_storage_url TEXT,
      source_local_path TEXT,
      pdf_storage_provider VARCHAR(20),
      pdf_storage_key TEXT,
      pdf_storage_url TEXT,
      pdf_local_path TEXT,
      pdf_file_name VARCHAR(255),
      error_message TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_investment_report_user_created
    ON investment_report (user_id, created_at DESC);
  `);
}

