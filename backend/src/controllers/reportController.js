import { verifyReportDownloadToken } from "../services/authService.js";
import { clearReportsForUser, createInvestmentReportJob, getReportPdfForEmailDownload, getUserReport, getUserReportPdf, listReportsForUser } from "../services/reportService.js";

export async function uploadDeck(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Pitch deck file is required." });
    }

    const report = await createInvestmentReportJob({
      user: req.user,
      file: req.file
    });

    return res.status(202).json({
      message: "Pitch deck accepted. Analysis has started.",
      report
    });
  } catch (error) {
    return res.status(400).json({ message: error.message || "Failed to process pitch deck." });
  }
}

export async function listReports(req, res) {
  const reports = await listReportsForUser(req.user.id);
  res.json({ reports });
}

export async function getReport(req, res) {
  try {
    const report = await getUserReport(req.params.reportId, req.user.id);
    res.json({ report });
  } catch (error) {
    res.status(404).json({ message: error.message });
  }
}

export async function downloadReport(req, res) {
  try {
    const pdf = await getUserReportPdf(req.params.reportId, req.user.id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${pdf.fileName}"`);
    res.send(pdf.buffer);
  } catch (error) {
    res.status(404).json({ message: error.message });
  }
}

export async function publicDownloadReport(req, res) {
  try {
    const token = String(req.query.token || "");
    if (!token) {
      return res.status(401).json({ message: "Download token is required." });
    }

    const payload = verifyReportDownloadToken(token);
    if (payload.reportId !== req.params.reportId) {
      return res.status(401).json({ message: "Download token does not match this report." });
    }

    const pdf = await getReportPdfForEmailDownload(payload.reportId, payload.userId);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${pdf.fileName}"`);
    return res.send(pdf.buffer);
  } catch (error) {
    return res.status(401).json({ message: error.message || "Invalid or expired download link." });
  }
}

export async function clearReportHistory(req, res) {
  try {
    const result = await clearReportsForUser(req.user.id);
    res.json({
      message: result.deletedCount > 0 ? "Analysis history cleared." : "No reports were available to clear.",
      deletedCount: result.deletedCount
    });
  } catch (error) {
    res.status(400).json({ message: error.message || "Unable to clear report history." });
  }
}
