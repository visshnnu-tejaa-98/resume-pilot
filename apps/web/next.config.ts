import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@resume-pilot/trpc",
    "@resume-pilot/credits",
    "@resume-pilot/validators",
    "@resume-pilot/services",
    "@resume-pilot/ai",
    "@resume-pilot/storage",
    "@resume-pilot/file-processing",
    "@resume-pilot/resume-templates",
    "@resume-pilot/emails",
    "@resume-pilot/database",
    "@resume-pilot/queue",
  ],
  // pdf.js loads its worker and wasm at runtime; bundling it breaks that.
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
