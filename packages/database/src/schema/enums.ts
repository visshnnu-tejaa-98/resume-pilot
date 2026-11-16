import { pgEnum } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);
export const userStatusEnum = pgEnum("user_status", ["active", "suspended"]);

export const resumeStatusEnum = pgEnum("resume_status", [
  "uploaded",
  "processing",
  "processed",
  "failed",
]);
export const resumeFormatEnum = pgEnum("resume_format", [
  "tex",
  "pdf",
  "docx",
  "png",
  "jpg",
  "jpeg",
]);
export const resumeVersionKindEnum = pgEnum("resume_version_kind", ["original", "generated"]);

export const aiJobTypeEnum = pgEnum("ai_job_type", ["jd_analysis", "generation", "ats_scoring"]);
export const aiJobStatusEnum = pgEnum("ai_job_status", [
  "pending",
  "running",
  "succeeded",
  "failed",
]);

export const atsReportStatusEnum = pgEnum("ats_report_status", ["current", "outdated"]);

export const creditLedgerTypeEnum = pgEnum("credit_ledger_type", [
  "purchase",
  "capture",
  "refund",
  "admin_adjustment",
  "coupon_credit",
  "referral_credit",
]);
export const creditHoldStatusEnum = pgEnum("credit_hold_status", [
  "active",
  "captured",
  "released",
]);

export const codeTypeEnum = pgEnum("code_type", ["coupon", "referral"]);
export const referrerStatusEnum = pgEnum("referrer_status", ["granted", "held", "rejected"]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "created",
  "captured",
  "failed",
  "refunded",
]);

export const emailSuppressionReasonEnum = pgEnum("email_suppression_reason", [
  "hard_bounce",
  "complaint",
  "unsubscribe_all",
]);
export const emailCampaignStatusEnum = pgEnum("email_campaign_status", [
  "draft",
  "scheduled",
  "sending",
  "sent",
  "cancelled",
]);
export const emailMessageStatusEnum = pgEnum("email_message_status", [
  "queued",
  "sent",
  "delivered",
  "opened",
  "clicked",
  "bounced",
  "failed",
  "unsubscribed",
  /** Not sent on purpose: suppressed address or suspended user (prd.md §13.1, §13.5). */
  "skipped",
]);
