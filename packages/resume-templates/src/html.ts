import type { Resume } from "@resume-pilot/validators/resume";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RESUME_CSS } from "./css";
import { ResumeTemplate } from "./Resume";
import type { TemplateKey } from "./templates";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/**
 * Full HTML document for Puppeteer (m9). Same component + CSS as the web
 * preview; `fontCss` is the inlined @font-face rules (node.ts `inlineFontCss`).
 */
export function renderResumeHtml(resume: Resume, template: TemplateKey, opts: { fontCss?: string; title?: string } = {}): string {
  const body = renderToStaticMarkup(createElement(ResumeTemplate, { resume, template }));
  const title = opts.title ?? ([resume.personalInfo.firstName, resume.personalInfo.lastName].filter(Boolean).join(" ") || "Resume");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${opts.fontCss ?? ""}${RESUME_CSS}</style></head><body>${body}</body></html>`;
}
