import type { ReactElement } from "react";
import { CodeAppliedEmail, codeAppliedEmailSubject } from "./templates/CodeApplied";
import { InactiveNudgeEmail, inactiveNudgeEmailSubject } from "./templates/InactiveNudge";
import { NewFeaturesEmail, newFeaturesEmailSubject } from "./templates/NewFeatures";
import { PaymentFailedEmail, paymentFailedEmailSubject } from "./templates/PaymentFailed";
import { PaymentPendingEmail, paymentPendingEmailSubject } from "./templates/PaymentPending";
import { PaymentSuccessEmail, paymentSuccessEmailSubject } from "./templates/PaymentSuccess";
import { PromoEmail, promoEmailSubject } from "./templates/Promo";
import { ReferralRewardEmail, referralRewardEmailSubject } from "./templates/ReferralReward";
import { WelcomeEmail, welcomeEmailSubject } from "./templates/Welcome";

export interface EmailPreview {
  /** Matches email_messages.template_key. */
  key: string;
  name: string;
  kind: "transactional" | "marketing";
  subject: string;
  render: (dark: boolean) => ReactElement;
}

/**
 * Every template with its sample props — used by the admin preview and
 * the render tests. Sample data only; real sends build props from the DB.
 */
export const EMAIL_PREVIEWS: EmailPreview[] = [
  {
    key: "welcome",
    name: "Welcome",
    kind: "transactional",
    subject: welcomeEmailSubject(WelcomeEmail.PreviewProps.firstName),
    render: (dark) => WelcomeEmail({ ...WelcomeEmail.PreviewProps, dark }),
  },
  {
    key: "code_applied",
    name: "Code applied",
    kind: "transactional",
    subject: codeAppliedEmailSubject(CodeAppliedEmail.PreviewProps),
    render: (dark) => CodeAppliedEmail({ ...CodeAppliedEmail.PreviewProps, dark }),
  },
  {
    key: "referral_reward",
    name: "Referral reward",
    kind: "transactional",
    subject: referralRewardEmailSubject(ReferralRewardEmail.PreviewProps),
    render: (dark) => ReferralRewardEmail({ ...ReferralRewardEmail.PreviewProps, dark }),
  },
  {
    key: "recharge_success",
    name: "Recharge successful",
    kind: "transactional",
    subject: paymentSuccessEmailSubject(PaymentSuccessEmail.PreviewProps),
    render: (dark) => PaymentSuccessEmail({ ...PaymentSuccessEmail.PreviewProps, dark }),
  },
  {
    key: "recharge_failed",
    name: "Recharge failed",
    kind: "transactional",
    subject: paymentFailedEmailSubject(PaymentFailedEmail.PreviewProps),
    render: (dark) => PaymentFailedEmail({ ...PaymentFailedEmail.PreviewProps, dark }),
  },
  {
    key: "recharge_pending",
    name: "Recharge pending",
    kind: "transactional",
    subject: paymentPendingEmailSubject(PaymentPendingEmail.PreviewProps),
    render: (dark) => PaymentPendingEmail({ ...PaymentPendingEmail.PreviewProps, dark }),
  },
  {
    key: "inactive_nudge",
    name: "Inactive nudge",
    kind: "marketing",
    subject: inactiveNudgeEmailSubject(),
    render: (dark) => InactiveNudgeEmail({ ...InactiveNudgeEmail.PreviewProps, dark }),
  },
  {
    key: "new_features",
    name: "New features",
    kind: "marketing",
    subject: newFeaturesEmailSubject(NewFeaturesEmail.PreviewProps),
    render: (dark) => NewFeaturesEmail({ ...NewFeaturesEmail.PreviewProps, dark }),
  },
  {
    key: "promo_code",
    name: "Promo code (postponed)",
    kind: "marketing",
    subject: promoEmailSubject(PromoEmail.PreviewProps),
    render: (dark) => PromoEmail({ ...PromoEmail.PreviewProps, dark }),
  },
];
