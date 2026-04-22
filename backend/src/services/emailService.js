import nodemailer from "nodemailer";
import { env } from "../config/env.js";

let transporter = null;

function getTransporter() {
  if (!env.emailEnabled) {
    return null;
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      auth: {
        user: env.smtp.user,
        pass: env.smtp.pass
      }
    });
  }

  return transporter;
}

export async function sendReportReadyEmail({ to, startupName, downloadUrl }) {
  const mailer = getTransporter();
  if (!mailer) {
    return;
  }

  await mailer.sendMail({
    from: env.smtp.from,
    to,
    subject: `Investment thesis ready for ${startupName}`,
    text: `Your investment thesis report for ${startupName} is ready.\nDownload: ${downloadUrl}`
  });
}
