import fs from "fs";
import path from "path";
import os from "os";
import { v4 as uuidv4 } from "uuid";
import { env } from "../config/env.js";
import { query } from "../db/client.js";
import { analyzePitchDeck } from "./analysisService.js";
import { issueReportDownloadToken } from "./authService.js";
import { sendReportReadyEmail } from "./emailService.js";
import { generateReportPdf } from "./pdfService.js";
import { deleteStoredArtifact, getStoredArtifactBuffer, uploadArtifact } from "./storageService.js";

export async function createInvestmentReportJob({ user, file }) {
  validateDeckConstraints(file);

  const reportId = uuidv4();
  const uploadedDeck = await uploadArtifact(file.path, {
    folder: `source-decks/${user.id}`,
    fileName: `${Date.now()}-${sanitizeFileName(file.originalname)}`,
    contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  });

  await query(
    `INSERT INTO investment_report (
      id, user_id, file_name, status, progress,
      source_storage_provider, source_storage_key, source_storage_url, source_local_path
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      reportId,
      user.id,
      file.originalname,
      "queued",
      5,
      uploadedDeck.provider,
      uploadedDeck.key,
      uploadedDeck.url,
      uploadedDeck.localPath
    ]
  );

  queueMicrotask(async () => {
    await processReport(reportId, user.email);
  });

  fs.unlink(file.path, () => {});
  return getUserReport(reportId, user.id);
}

export async function listReportsForUser(userId) {
  const result = await query(
    `SELECT
      id, user_id AS "userId", startup_name AS "startupName", file_name AS "fileName",
      status, progress, recommendation, overall_score AS "overallScore",
      confidence_score AS "confidenceScore", executive_summary AS "executiveSummary",
      processing_date_utc AS "processingDateUtc", categories, strengths, weaknesses,
      recommendations, slide_count AS "slideCount", detected_slide_types AS "detectedSlideTypes",
      pdf_storage_provider AS "pdfStorageProvider", pdf_storage_key AS "pdfStorageKey",
      pdf_storage_url AS "pdfStorageUrl", pdf_local_path AS "pdfLocalPath",
      pdf_file_name AS "pdfFileName", error_message AS "errorMessage",
      created_at AS "createdAt", updated_at AS "updatedAt"
     FROM investment_report
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
  );

  return result.rows;
}

export async function getUserReport(reportId, userId) {
  const result = await query(
    `SELECT
      id, user_id AS "userId", startup_name AS "startupName", file_name AS "fileName",
      status, progress, recommendation, overall_score AS "overallScore",
      confidence_score AS "confidenceScore", executive_summary AS "executiveSummary",
      processing_date_utc AS "processingDateUtc", categories, strengths, weaknesses,
      recommendations, slide_count AS "slideCount", detected_slide_types AS "detectedSlideTypes",
      pdf_storage_provider AS "pdfStorageProvider", pdf_storage_key AS "pdfStorageKey",
      pdf_storage_url AS "pdfStorageUrl", pdf_local_path AS "pdfLocalPath",
      pdf_file_name AS "pdfFileName", error_message AS "errorMessage",
      created_at AS "createdAt", updated_at AS "updatedAt"
     FROM investment_report
     WHERE id = $1 AND user_id = $2`,
    [reportId, userId]
  );

  if (!result.rows[0]) {
    throw new Error("Report not found.");
  }

  return result.rows[0];
}

export async function getUserReportPdf(reportId, userId) {
  const report = await getUserReport(reportId, userId);
  if (!report.pdfStorageProvider && !report.pdfLocalPath) {
    throw new Error("Generated PDF not found.");
  }

  const buffer = await getStoredArtifactBuffer({
    provider: report.pdfStorageProvider,
    key: report.pdfStorageKey,
    localPath: report.pdfLocalPath
  });

  return {
    buffer,
    fileName: report.pdfFileName || `Investment_Thesis_${sanitizeFileName(report.startupName || "Startup")}.pdf`
  };
}

export async function getReportPdfForEmailDownload(reportId, userId) {
  return getUserReportPdf(reportId, userId);
}

export async function clearReportsForUser(userId) {
  const result = await query(
    `SELECT
      id,
      source_storage_provider AS "sourceStorageProvider",
      source_storage_key AS "sourceStorageKey",
      source_local_path AS "sourceLocalPath",
      pdf_storage_provider AS "pdfStorageProvider",
      pdf_storage_key AS "pdfStorageKey",
      pdf_local_path AS "pdfLocalPath"
     FROM investment_report
     WHERE user_id = $1`,
    [userId]
  );

  await Promise.all(result.rows.map(async (report) => {
    await safelyDeleteArtifact({
      provider: report.sourceStorageProvider,
      key: report.sourceStorageKey,
      localPath: report.sourceLocalPath
    });

    await safelyDeleteArtifact({
      provider: report.pdfStorageProvider,
      key: report.pdfStorageKey,
      localPath: report.pdfLocalPath
    });
  }));

  await query("DELETE FROM investment_report WHERE user_id = $1", [userId]);

  return { deletedCount: result.rowCount || 0 };
}

async function processReport(reportId, userEmail) {
  const report = await query(
    `SELECT
       id,
       user_id AS "userId",
       file_name AS "fileName",
       source_storage_provider AS "sourceStorageProvider",
       source_storage_key AS "sourceStorageKey",
       source_local_path AS "sourceLocalPath"
     FROM investment_report WHERE id = $1`,
    [reportId]
  );

  const current = report.rows[0];
  if (!current) {
    return;
  }

  let generatedPdfPath = null;

  try {
    await updateReportStatus(reportId, "extracting", 20);
    const sourceFilePath = await ensureSourceDeckPath(current);
    const analysis = await analyzePitchDeck({
      filePath: sourceFilePath,
      originalName: current.fileName,
      env
    });

    validateAnalysisConstraints(analysis);
    await updateReportStatus(reportId, "analyzing", 65);

    const reportPayload = {
      id: reportId,
      startupName: analysis.startupName,
      recommendation: analysis.recommendation,
      overallScore: analysis.overallScore,
      confidenceScore: analysis.confidenceScore,
      confidenceSummary: analysis.confidenceSummary,
      executiveSummary: analysis.executiveSummary,
      processingDateUtc: analysis.processingDateUtc,
      categories: analysis.categories,
      strengths: analysis.strengths,
      weaknesses: analysis.weaknesses,
      recommendations: analysis.recommendations
    };

    await updateReportStatus(reportId, "generating_pdf", 82);
    const pdf = await generateReportPdf(reportPayload);
    generatedPdfPath = pdf.filePath;

    const uploadedPdf = await uploadArtifact(pdf.filePath, {
      folder: `reports/${reportId}`,
      fileName: pdf.fileName,
      contentType: "application/pdf"
    });

    await query(
      `UPDATE investment_report
       SET startup_name = $2,
           status = $3,
           progress = $4,
           recommendation = $5,
           overall_score = $6,
           confidence_score = $7,
           executive_summary = $8,
           processing_date_utc = $9,
           categories = $10,
           strengths = $11,
           weaknesses = $12,
           recommendations = $13,
           slide_count = $14,
           detected_slide_types = $15,
           pdf_storage_provider = $16,
           pdf_storage_key = $17,
           pdf_storage_url = $18,
           pdf_local_path = $19,
           pdf_file_name = $20,
           updated_at = NOW()
       WHERE id = $1`,
      [
        reportId,
        analysis.startupName,
        "completed",
        100,
        analysis.recommendation,
        analysis.overallScore,
        analysis.confidenceScore,
        analysis.executiveSummary,
        analysis.processingDateUtc,
        JSON.stringify(analysis.categories),
        JSON.stringify(analysis.strengths),
        JSON.stringify(analysis.weaknesses),
        analysis.recommendations,
        analysis.slideCount,
        JSON.stringify(analysis.extraction.detectedSlideTypes || []),
        uploadedPdf.provider,
        uploadedPdf.key,
        uploadedPdf.url,
        uploadedPdf.localPath,
        pdf.fileName
      ]
    );

    const downloadToken = issueReportDownloadToken({
      reportId,
      userId: current.userId
    });

    await sendReportReadyEmail({
      to: userEmail,
      startupName: analysis.startupName,
      downloadUrl: `${env.publicAppBaseUrl}/api/reports/public/${reportId}/download?token=${encodeURIComponent(downloadToken)}`
    });

    cleanupGeneratedPdf(generatedPdfPath);
    cleanupTemporarySourceFile(current, sourceFilePath);
  } catch (error) {
    cleanupGeneratedPdf(generatedPdfPath);
    cleanupTemporarySourceFile(current);
    await query(
      `UPDATE investment_report
       SET status = $2, progress = $3, error_message = $4, updated_at = NOW()
       WHERE id = $1`,
      [reportId, "failed", 100, error.message || "Processing failed."]
    );
  }
}

async function updateReportStatus(reportId, status, progress) {
  await query(
    `UPDATE investment_report
     SET status = $2, progress = $3, updated_at = NOW()
     WHERE id = $1`,
    [reportId, status, progress]
  );
}

async function ensureSourceDeckPath(report) {
  if (report.sourceStorageProvider !== "s3" && report.sourceLocalPath && fs.existsSync(report.sourceLocalPath)) {
    return report.sourceLocalPath;
  }

  const extension = path.extname(report.fileName || "") || ".pptx";
  const tempPath = path.join(os.tmpdir(), `deck-${report.id}${extension}`);
  const buffer = await getStoredArtifactBuffer({
    provider: report.sourceStorageProvider,
    key: report.sourceStorageKey,
    localPath: report.sourceLocalPath
  });

  fs.writeFileSync(tempPath, buffer);
  report.tempSourcePath = tempPath;
  return tempPath;
}

function cleanupTemporarySourceFile(report, sourceFilePath = report?.tempSourcePath) {
  if (!report?.tempSourcePath || report.tempSourcePath !== sourceFilePath) {
    return;
  }

  fs.unlink(report.tempSourcePath, () => {});
}

function cleanupGeneratedPdf(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return;
  }

  fs.unlink(filePath, () => {});
}

function validateDeckConstraints(file) {
  const extension = path.extname(file.originalname).toLowerCase();
  if (![".ppt", ".pptx"].includes(extension)) {
    throw new Error("Uploaded file must be PPT or PPTX.");
  }

  if (file.size > 50 * 1024 * 1024) {
    throw new Error("Uploaded file exceeds 50 MB.");
  }
}

function validateAnalysisConstraints(analysis) {
  if (analysis.slideCount < 5 || analysis.slideCount > 20) {
    throw new Error("Pitch deck must contain between 5 and 20 slides.");
  }

  const detectedSlideTypes = analysis.extraction.detectedSlideTypes || [];
  if (detectedSlideTypes.length < 3) {
    throw new Error("Pitch deck must include at least 3 recognizable startup sections such as Problem, Solution, Market, Team, or Financials.");
  }
}

function sanitizeFileName(fileName) {
  return fileName.replace(/[^\w.-]/g, "_");
}

async function safelyDeleteArtifact(artifact) {
  if (!artifact.provider && !artifact.localPath && !artifact.key) {
    return;
  }

  try {
    await deleteStoredArtifact(artifact);
  } catch {
    // Best-effort cleanup. Database deletion should not fail because an artifact is already missing.
  }
}
