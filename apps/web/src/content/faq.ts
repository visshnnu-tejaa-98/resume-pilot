export interface FaqGroup {
  id: string;
  title: string;
  items: { q: string; a: string }[];
}

/** design/screens/FAQ.dc.html */
export const faqGroups: FaqGroup[] = [
  {
    id: "credits",
    title: "Credits and payments",
    items: [
      { q: "How do credits work?", a: "Add ₹500 to your wallet and get 10,000 credits. Paid actions (job description analysis, generation and ATS scoring) use credits. You see the estimate before every action and only pay what’s used." },
      { q: "Do credits expire?", a: "No. Credits stay in your wallet until you use them." },
      { q: "What happens if a generation fails?", a: "The credits held for it are released straight away. You’re never charged for a failed run." },
      { q: "How do I use EARLYBIRD?", a: "Enter it when you sign up or later on the Wallet page to get 500 free credits. Each account can use one code, either a coupon or a referral code." },
      { q: "Can I get a refund?", a: "Unused purchased credits can be refunded within [REFUND WINDOW]. See the refund policy for details." },
    ],
  },
  {
    id: "ai",
    title: "Resumes and AI",
    items: [
      { q: "Will the AI make things up?", a: "No. It rewrites and reorders what’s already in your resume. Every result is checked so companies, titles, dates, skills and numbers match your original." },
      { q: "What if the job needs a skill I don’t have?", a: "It appears as a gap in your report. If you do have it, add it to your resume yourself; the AI never adds it for you." },
      { q: "Can I edit the generated resume?", a: "Yes, every field. Your manual edits are always kept. After editing, re-score to update the ATS score." },
      { q: "Is the ATS score what employers see?", a: "It’s an estimate based on a documented method. Employers use different ATS systems, so no score is a guarantee." },
    ],
  },
  {
    id: "files",
    title: "Uploads and files",
    items: [
      { q: "Which formats can I upload?", a: "PDF, DOCX, LaTeX (.tex), PNG and JPG, up to 10 MB and 5 pages. Scanned documents are read with OCR." },
      { q: "Is uploading free?", a: "Yes. Uploading and extraction never use credits." },
    ],
  },
  {
    id: "privacy",
    title: "Privacy",
    items: [
      { q: "Is my resume used to train AI?", a: "No. Your resume data is never used for model training." },
      { q: "How long do you keep my files?", a: "Uploaded files are deleted after 30 days. Your structured resume and versions stay until you delete them or your account." },
    ],
  },
];
