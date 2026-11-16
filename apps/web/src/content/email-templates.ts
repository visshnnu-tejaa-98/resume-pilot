/**
 * Email catalog (prd.md §13). `live` = a sender exists today
 * (packages/emails + queue processor); the rest are planned in
 * tasks/todo/m11-email. Transactional emails can't be switched off;
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
  { key: "code_applied", name: "Code applied", kind: "transactional", trigger: "Coupon or referral redeemed", live: false },
  { key: "payment_success", name: "Recharge successful", kind: "transactional", trigger: "payment.captured", live: false },
  { key: "payment_failed", name: "Recharge failed", kind: "transactional", trigger: "payment.failed", live: false },
  { key: "payment_pending", name: "Recharge pending", kind: "transactional", trigger: "Pending after 10 min", live: false },
  { key: "inactive_nudge", name: "Inactive nudge", kind: "marketing", trigger: "No sign-in for N days", live: false },
  { key: "new_features", name: "New features", kind: "marketing", trigger: "Admin campaign", live: false },
];

export const templateName = (key: string) => EMAIL_TEMPLATES.find((t) => t.key === key)?.name ?? key;
