/**
 * Email catalog (prd.md §13). `live` = a sender exists today
 * (packages/emails + queue processor). Transactional emails can't be switched off;
 * marketing ones respect `email_template_settings.enabled` and opt-outs.
 */
export interface EmailTemplateInfo {
  key: string;
  name: string;
  kind: "transactional" | "marketing";
  trigger: string;
  live: boolean;
}

export const EMAIL_TEMPLATES: EmailTemplateInfo[] = [
  { key: "welcome", name: "Welcome", kind: "transactional", trigger: "Account created", live: true },
  { key: "code_applied", name: "Code applied", kind: "transactional", trigger: "Coupon or referral redeemed", live: true },
  { key: "referral_reward", name: "Referral reward", kind: "transactional", trigger: "Referrer's credits granted", live: true },
  { key: "recharge_success", name: "Recharge successful", kind: "transactional", trigger: "purchase ledger row", live: true },
  { key: "recharge_failed", name: "Recharge failed", kind: "transactional", trigger: "payment.failed", live: true },
  { key: "recharge_pending", name: "Recharge pending", kind: "transactional", trigger: "Pending after 10 min", live: true },
  { key: "inactive_nudge", name: "Inactive nudge", kind: "marketing", trigger: "No sign-in for 30 days", live: true },
  { key: "new_features", name: "New features", kind: "marketing", trigger: "Admin campaign", live: true },
];

export const templateName = (key: string) => EMAIL_TEMPLATES.find((t) => t.key === key)?.name ?? key;
