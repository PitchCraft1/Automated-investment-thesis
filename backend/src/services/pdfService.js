import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const reportDir = path.resolve(__dirname, "../../reports/generated");

fs.mkdirSync(reportDir, { recursive: true });

export async function generateReportPdf(report) {
  const dateToken = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const safeStartupName = report.startupName.replace(/[^\w-]/g, "_");
  const fileName = `Investment_Thesis_${safeStartupName}_${dateToken}.pdf`;
  const filePath = path.join(reportDir, fileName);
  const doc = new PDFDocument({ size: "A4", margin: 50 });

  return new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    writeTitle(doc, "Investment Thesis Report");
    writeBody(doc, `Startup: ${report.startupName}`);
    writeDivider(doc);

    writeHeading(doc, "1. Summary Section");
    writeKeyValue(doc, "Investment Recommendation", report.recommendation);
    writeKeyValue(doc, "Overall Score", `${report.overallScore}/100`);
    writeKeyValue(doc, "Confidence Score", `${report.confidenceScore}/100`);
    writeKeyValue(doc, "Processing Date", report.processingDateUtc);
    writeBody(doc, report.executiveSummary);

    writeHeading(doc, "2. Category-wise Analysis");
    report.categories.forEach((category) => {
      doc.font("Helvetica-Bold").fontSize(11).text(category.title);
      doc.moveDown(0.12);
      writeKeyValue(doc, "Score", `${category.score}/10`);
      writeKeyValue(doc, "Weight", `${category.weight}%`);
      writeBody(doc, category.feedback);
      doc.moveDown(0.35);
    });

    writeHeading(doc, "3. Strengths and Weaknesses");
    doc.font("Helvetica-Bold").fontSize(12).text("Strengths");
    doc.moveDown(0.18);
    report.strengths.forEach((item) => writeBullet(doc, item));
    doc.moveDown(0.35);

    doc.font("Helvetica-Bold").fontSize(12).text("Weaknesses");
    doc.moveDown(0.18);
    report.weaknesses.forEach((item) => writeBullet(doc, item));
    doc.moveDown(0.35);

    writeHeading(doc, "4. Recommendations");
    writeBody(doc, report.recommendations);

    writeHeading(doc, "5. Confidence Summary");
    writeBody(doc, report.confidenceSummary);

    doc.end();
    stream.on("finish", () => resolve({ fileName, filePath }));
    stream.on("error", reject);
  });
}

function writeTitle(doc, value) {
  doc.font("Helvetica-Bold").fontSize(18).text(value);
  doc.moveDown(0.35);
}

function writeHeading(doc, value) {
  doc.font("Helvetica-Bold").fontSize(14).text(value);
  doc.moveDown(0.35);
}

function writeKeyValue(doc, label, value) {
  doc.font("Helvetica-Bold").fontSize(11).text(`${label}: `, { continued: true });
  doc.font("Helvetica").fontSize(11).text(value);
  doc.moveDown(0.12);
}

function writeBody(doc, value) {
  doc.font("Helvetica").fontSize(11).text(value, { align: "justify" });
  doc.moveDown(0.25);
}

function writeBullet(doc, value) {
  doc.font("Helvetica").fontSize(11).text(`- ${value}`, { indent: 12 });
}

function writeDivider(doc) {
  const startX = doc.page.margins.left;
  const endX = doc.page.width - doc.page.margins.right;
  const y = doc.y + 2;
  doc.moveTo(startX, y).lineTo(endX, y).strokeColor("#B8B8B8").stroke();
  doc.moveDown(0.7);
}
