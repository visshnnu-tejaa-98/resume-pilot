import { routes } from "@/lib/routes";

export type LegalDocId = "privacy" | "terms" | "refunds";

export interface LegalDoc {
  id: LegalDocId;
  tab: string;
  href: string;
  title: string;
  updated: string;
  sections: { id: string; h: string; p: string }[];
}

/**
 * design/screens/Legal.dc.html — template text only. Final wording must be
 * drafted or reviewed by a lawyer before launch.
 */
export const legalDocs: Record<LegalDocId, LegalDoc> = {
  privacy: {
    id: "privacy",
    tab: "Privacy",
    href: routes.privacy,
    title: "Privacy policy",
    updated: "[DATE]",
    sections: [
      { id: "collect", h: "What we collect", p: "Your account details from sign-in (name, email), the resumes you upload, the structured data we extract, job descriptions you paste, and payment records from Razorpay. [LEGAL TEXT]" },
      { id: "use", h: "How we use it", p: "Only to run the features you ask for: extraction, tailoring, scoring and PDF export. Your resume data is never used to train AI models. [LEGAL TEXT]" },
      { id: "ai", h: "AI processing", p: "Resume and job description text is sent to our AI provider (OpenAI) to generate results. [PROVIDER DATA-RETENTION TERMS]" },
      { id: "retention", h: "How long we keep it", p: "Uploaded files are deleted after 30 days. Structured resumes, versions and reports stay until you delete them or your account." },
      { id: "rights", h: "Your rights", p: "You can view, correct and delete your data, and delete your account, at any time. We follow India’s Digital Personal Data Protection Act, 2023. [LEGAL TEXT]" },
      { id: "contact-p", h: "Grievance officer", p: "[NAME, EMAIL, ADDRESS]" },
    ],
  },
  terms: {
    id: "terms",
    tab: "Terms",
    href: routes.terms,
    title: "Terms and conditions",
    updated: "[DATE]",
    sections: [
      { id: "service", h: "The service", p: "Resume Pilot tailors resumes and estimates ATS compatibility. The score is an estimate, not a guarantee of any employer’s result. [LEGAL TEXT]" },
      { id: "account", h: "Your account", p: "One account per person. Coupon and referral codes can be used once per account. [LEGAL TEXT]" },
      { id: "content", h: "Your content", p: "You own your resume. You are responsible for the accuracy of anything you add or edit manually. [LEGAL TEXT]" },
      { id: "credits", h: "Credits", p: "Credits are bought through Razorpay, are not cash, cannot be transferred, and do not expire. [LEGAL TEXT]" },
      { id: "use-rules", h: "Acceptable use", p: "[LEGAL TEXT]" },
      { id: "liability", h: "Liability", p: "[LEGAL TEXT]" },
    ],
  },
  refunds: {
    id: "refunds",
    tab: "Refunds",
    href: routes.refunds,
    title: "Refund policy",
    updated: "[DATE]",
    sections: [
      { id: "failed", h: "Failed actions", p: "If an AI action fails, its held credits are released automatically. No refund request is needed." },
      { id: "unused", h: "Unused credits", p: "Unused purchased credits can be refunded within [REFUND WINDOW] of purchase. Free credits from coupons or referrals are not refundable." },
      { id: "how", h: "How to request", p: "Contact support with your Razorpay payment ID. Refunds go back to the original payment method. [PROCESSING TIME]" },
      { id: "gst", h: "Taxes", p: "[GST TREATMENT]" },
    ],
  },
};

export const legalOrder: LegalDocId[] = ["privacy", "terms", "refunds"];
