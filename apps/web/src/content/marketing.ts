/** Copy for the public pages, lifted verbatim from design/screens. */

export const flightRoute = [
  { id: "upload", title: "Upload", short: "Upload", body: "Drop in a PDF, DOCX, LaTeX file or a photo of your resume.", cost: "Free" },
  { id: "review", title: "Review", short: "Review", body: "Check what we extracted. Anything we were unsure about is highlighted.", cost: "Free" },
  { id: "job", title: "Add the job", short: "Add the job", body: "Paste the job description, up to 30,000 characters.", cost: "Free" },
  { id: "generate", title: "Generate", short: "Generate", body: "Confirm the credit estimate. We tailor your resume to the role.", cost: "Credits" },
  { id: "score", title: "Score and download", short: "Score and download", body: "Get your ATS score and report, edit anything, pick a template, download the PDF.", cost: "Credits for scoring" },
] as const;

/** Index of the stop that costs credits — drawn in orange. */
export const PAID_STOP = 3;

export const pilotWill = [
  "Rewrite your summary for the role",
  "Rephrase and reorder your bullets",
  "Pick your most relevant projects",
  "Use the job’s wording for skills you have",
  "Flag skills the job wants that you lack",
];

export const pilotNever = [
  "Add companies, titles or degrees",
  "Change any of your dates",
  "Add skills you didn’t list",
  "Invent numbers or achievements",
  "Follow instructions hidden in a job post",
];

export const sampleDimensions = [
  { label: "Required keywords", value: 26, max: 30 },
  { label: "Skills match", value: 21, max: 25 },
  { label: "Experience relevance", value: 16, max: 20 },
  { label: "Education", value: 8, max: 10 },
  { label: "Structure and formatting", value: 11, max: 15 },
];

export const uploadFormats = [".pdf", ".docx", ".tex", ".png · .jpg"];

export const pricing = {
  topUpInr: "₹500",
  topUpCredits: "10,000 credits",
  launchCode: "EARLYBIRD",
  launchCredits: "500 free credits",
  perks: [
    "Credits never expire",
    "Top up as many times as you like",
    "Every feature included for every user",
    "Pay securely with UPI, cards or netbanking via Razorpay",
  ],
  alwaysFree: [
    "Uploading resumes",
    "Text extraction and OCR",
    "Editing any version",
    "All 5 templates",
    "PDF downloads",
    "Duplicating versions",
    "Re-opening a cached score",
    "Comparing cached scores",
  ],
  actions: [
    { name: "Job description analysis", cost: "~[N]", note: "Runs once per job description, then reused for free" },
    { name: "Tailored resume generation", cost: "~[N]", note: "Creates a new version; your original is never changed" },
    { name: "ATS score and report", cost: "~[N]", note: "Free again if the resume and job haven’t changed" },
    { name: "Original vs tailored comparison", cost: "0 to 2 scores", note: "Only the scores that aren’t cached are charged" },
  ],
  howCharging: [
    { title: "See the estimate", body: "Before any paid action, a confirmation shows what will run, the credits it will use at most, and your balance after." },
    { title: "Pay the actual amount", body: "We hold the estimate, then charge only what was used. The rest goes straight back to your wallet." },
    { title: "Failures cost nothing", body: "If a run fails or times out, every held credit is released. You are never charged for a failed run." },
  ],
};

export const templates = [
  { name: "Classic", tag: "Default" },
  { name: "Modern", tag: "" },
  { name: "Minimal", tag: "" },
  { name: "Professional", tag: "" },
  { name: "Technical", tag: "" },
];

export const aiRules = [
  { yes: "Rewrite your summary using your facts", no: "Add, remove or rename companies, titles or degrees" },
  { yes: "Rephrase and reorder bullets", no: "Change any date" },
  { yes: "Choose which bullets and projects to show", no: "Add skills, tools or certifications you didn’t list" },
  { yes: "Reorder sections and skills", no: "Add numbers or metrics that aren’t in your resume" },
  { yes: "Use the job’s wording for skills you have", no: "Claim experience or years you don’t have" },
];

export const aboutValues = [
  { n: "01", title: "Your facts stay yours", body: "The AI rewrites and reorders. It never adds companies, dates, skills or numbers you didn’t give it, and every output is checked before you see it." },
  { n: "02", title: "Pay only for success", body: "You see the cost before anything runs and pay only what’s used. If a run fails, you pay nothing." },
  { n: "03", title: "Clear, not magic", body: "The ATS score is an estimate with a breakdown you can read, not a mystery number. Gaps are shown honestly so you can decide what to do." },
];

export const aboutData = [
  "Your resume data is never used to train AI models.",
  "Uploaded files are deleted after 30 days; your structured resume stays until you delete it.",
  "Delete any resume, version or your whole account at any time.",
  "Files are stored privately and only you can open them.",
];

export const contactTopics = [
  "Credits and payments",
  "Upload or extraction problem",
  "Generated resume or ATS score",
  "Account and privacy",
  "Something else",
] as const;
