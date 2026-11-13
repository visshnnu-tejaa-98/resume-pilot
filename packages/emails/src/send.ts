import { render } from "@react-email/render";
import nodemailer, { type Transporter } from "nodemailer";
import type { ReactElement } from "react";

export interface SendEmailInput {
  to: string;
  subject: string;
  element: ReactElement;
}

export interface SendEmailResult {
  messageId: string;
}

let transporter: Transporter | undefined;

/**
 * SES SMTP per CLAUDE.md's stack choice (Nodemailer over Amazon SES
 * SMTP, not the SES API directly). Lazily built so importing this
 * module never requires SMTP env vars to be set — only sending does.
 */
function getTransporter(): Transporter {
  if (transporter) {
    return transporter;
  }

  const host = process.env.SES_SMTP_HOST;
  const port = process.env.SES_SMTP_PORT;
  const user = process.env.SES_SMTP_USER;
  const pass = process.env.SES_SMTP_PASSWORD;

  if (!host || !port || !user || !pass) {
    throw new Error(
      "SES SMTP is not configured — set SES_SMTP_HOST, SES_SMTP_PORT, SES_SMTP_USER, SES_SMTP_PASSWORD",
    );
  }

  transporter = nodemailer.createTransport({
    host,
    port: Number(port),
    secure: Number(port) === 465,
    auth: { user, pass },
  });
  return transporter;
}

export async function sendEmail({
  to,
  subject,
  element,
}: SendEmailInput): Promise<SendEmailResult> {
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);

  const from = process.env.EMAIL_FROM_ADDRESS ?? "Resume Pilot <noreply@resumepilot.app>";
  const info = await getTransporter().sendMail({ from, to, subject, html, text });
  return { messageId: info.messageId };
}
