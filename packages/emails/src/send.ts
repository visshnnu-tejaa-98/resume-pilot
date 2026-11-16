import { render } from "@react-email/render";
import nodemailer, { type Transporter } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
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
 * Builds SMTP transport options from env vars. Exported for tests.
 *
 * - Port 465 uses implicit TLS; any other port (587) must upgrade via
 *   STARTTLS (`requireTLS`), so credentials never go over plaintext
 *   even if a server or middlebox doesn't offer STARTTLS.
 * - Timeouts are short: sends happen inside request handlers (the
 *   Clerk webhook today), and Nodemailer's defaults (2 min connect,
 *   10 min socket) would outlast the webhook timeout and trigger
 *   retries.
 */
export function smtpOptionsFromEnv(env: NodeJS.ProcessEnv = process.env): SMTPTransport.Options {
  const host = env.SMTP_HOST;
  const port = Number(env.SMTP_PORT);
  const user = env.SMTP_USER;
  const pass = env.SMTP_PASSWORD;

  if (!host || !env.SMTP_PORT || !user || !pass) {
    throw new Error("SMTP is not configured — set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD");
  }
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error(`SMTP_PORT must be a valid port number, got "${env.SMTP_PORT}"`);
  }

  const secure = port === 465;
  return {
    host,
    port,
    secure,
    requireTLS: !secure,
    auth: { user, pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  };
}

/**
 * Nodemailer over any SMTP provider (CLAUDE.md) — no vendor SDK, so the
 * provider can change via env vars alone. Lazily built so importing this
 * module never requires SMTP env vars to be set — only sending does.
 */
function getTransporter(): Transporter {
  if (transporter) {
    return transporter;
  }

  transporter = nodemailer.createTransport(smtpOptionsFromEnv());
  return transporter;
}

export async function sendEmail({
  to,
  subject,
  element,
}: SendEmailInput): Promise<SendEmailResult> {
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);

  const from = process.env.EMAIL_FROM_ADDRESS || "Resume Pilot <noreply@resumepilot.app>";
  const info = await getTransporter().sendMail({ from, to, subject, html, text });
  return { messageId: info.messageId };
}
