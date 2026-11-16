import type { AuthStep } from "@/components/auth/AuthShell";

export const signInCopy = {
  headline: "Pick up right where you left off.",
  subtext: "Your resumes, tailored versions, scores and credits are waiting.",
};

export const signUpCopy = {
  headline: "Plot your first route in minutes.",
  steps: [
    { title: "Create your account", body: "Free. Your wallet starts at 0 credits." },
    { title: "Apply a code", body: "EARLYBIRD or a friend’s referral adds 500 credits." },
    { title: "Upload your resume", body: "PDF, DOCX, LaTeX or a photo. Always free." },
    { title: "Tailor it to a job", body: "See the cost first, pay only what’s used." },
  ] satisfies AuthStep[],
};

/** Where a freshly created account lands (design: SignUp → Welcome). */
export const AFTER_SIGN_UP = "/welcome";
export const AFTER_SIGN_IN = "/dashboard";
