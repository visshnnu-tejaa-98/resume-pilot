"use client";

import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/source-serif-4/400.css";
import "@fontsource/source-serif-4/600.css";
import "@fontsource/source-serif-4/700.css";
import "@fontsource/space-grotesk/400.css";
import "@fontsource/space-grotesk/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/700.css";
import { PAGE, RESUME_CSS, ResumeTemplate, toTemplateKey } from "@resume-pilot/resume-templates";
import type { Resume } from "@resume-pilot/validators/resume";
import { memo, useLayoutEffect, useRef, useState } from "react";

const MM = 96 / 25.4;
export const PAGE_W = PAGE.widthMm * MM;
const PAGE_H = PAGE.heightMm * MM;
/** Usable height per printed page (top + bottom margins removed). */
const CONTENT_H = (PAGE.heightMm - 2 * PAGE.marginYMm) * MM;

interface ResumeDocumentProps {
  resume: Resume;
  /** Template key or display name. */
  template: string;
  /** 1 = actual A4 size at 96 dpi. */
  zoom?: number;
  /** Page count after layout (for page navigation). */
  onPages?: (n: number) => void;
  className?: string;
}

/**
 * Live A4 preview — the exact component and CSS the PDF renders
 * (@resume-pilot/resume-templates), with the same self-hosted fonts.
 * Scaled with a transform so wrapping never changes with zoom.
 */
export const ResumeDocument = memo(function ResumeDocument({ resume, template, zoom = 1, onPages, className }: ResumeDocumentProps) {
  const inner = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(PAGE_H);
  const key = toTemplateKey(template);

  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    const measure = () => setHeight(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Printed pages: content flows in CONTENT_H slices between fixed margins.
  const pages = Math.max(1, Math.ceil((height - 2 * PAGE.marginYMm * MM - 1) / CONTENT_H));
  useLayoutEffect(() => onPages?.(pages), [pages, onPages]);

  return (
    <div className={className} style={{ width: PAGE_W * zoom, height: Math.max(height, pages * PAGE_H) * zoom }}>
      <style>{RESUME_CSS}</style>
      <div
        ref={inner}
        aria-label={`Resume preview, ${key} template, ${pages} ${pages === 1 ? "page" : "pages"}`}
        className="relative origin-top-left shadow-[0_12px_40px_rgba(0,0,0,0.22)]"
        style={{ width: PAGE_W, transform: `scale(${zoom})`, minHeight: pages * PAGE_H, background: "#fff" }}
      >
        <ResumeTemplate resume={resume} template={key} />
        {Array.from({ length: pages - 1 }, (_, i) => (
          <div
            key={i}
            id={`resume-page-${i + 2}`}
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-[#9AA8B8]"
            style={{ top: PAGE.marginYMm * MM + CONTENT_H * (i + 1) }}
          >
            <span className="absolute right-2 -top-5 font-mono text-[11px] text-[#6B7785]">Page {i + 2}</span>
          </div>
        ))}
      </div>
    </div>
  );
});
