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
const MARGIN_Y = PAGE.marginYMm * MM;
/** Usable height per printed page (top + bottom margins removed). */
const CONTENT_H = PAGE_H - 2 * MARGIN_Y;
/** Gap between pages on screen. */
const GAP = 24;

/** Elements a page may not split: lines of text, rows, headings. */
const UNSPLITTABLE = ".rp-head, .rp-h, .rp-row, .rp-sub, .rp-link, .rp-tags, .rp-lines > li, .rp-item > p, .rp-section > p";

/** Body flows with no vertical page padding; each on-screen page adds its own margins. */
const SLICE_CSS = `.rp-slice .rp-resume{padding-top:0;padding-bottom:0;min-height:0}`;

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
 * Where each page starts (px offsets into the flowed content): a line that
 * would cross a page's bottom margin moves to the next page, so no line is
 * cut in half — the same rule the PDF's print engine follows.
 */
function pageBreaks(root: HTMLElement): number[] {
  const box = root.getBoundingClientRect();
  const total = root.offsetHeight;
  const scale = box.height / (total || 1) || 1;
  const blocks = [...root.querySelectorAll<HTMLElement>(UNSPLITTABLE)].map((el) => {
    const r = el.getBoundingClientRect();
    return { top: (r.top - box.top) / scale, bottom: (r.bottom - box.top) / scale };
  });
  const starts = [0];
  let start = 0;
  while (total - start > CONTENT_H + 0.5 && starts.length < 50) {
    const limit = start + CONTENT_H;
    const crossing = blocks.filter((b) => b.top > start + 1 && b.top < limit && b.bottom > limit).map((b) => b.top);
    const next = crossing.length ? Math.min(...crossing) : limit;
    start = next > start + 1 ? next : limit;
    starts.push(start);
  }
  return [...starts, total];
}

/**
 * Live A4 preview — the exact component and CSS the PDF renders
 * (@resume-pilot/resume-templates), with the same self-hosted fonts.
 * Content is laid out once (hidden) to find line-safe page breaks, then
 * shown as separate A4 sheets with margins on all four sides. Scaled with
 * a transform so wrapping never changes with zoom.
 */
export const ResumeDocument = memo(function ResumeDocument({ resume, template, zoom = 1, onPages, className }: ResumeDocumentProps) {
  const measure = useRef<HTMLDivElement>(null);
  const [breaks, setBreaks] = useState<number[]>([0, CONTENT_H]);
  const key = toTemplateKey(template);

  useLayoutEffect(() => {
    const el = measure.current;
    if (!el) return;
    const run = () =>
      setBreaks((prev) => {
        const next = pageBreaks(el);
        return next.length === prev.length && next.every((v, i) => Math.abs(v - prev[i]!) < 0.5) ? prev : next;
      });
    run();
    const ro = new ResizeObserver(run);
    ro.observe(el);
    void document.fonts?.ready.then(run);
    return () => ro.disconnect();
  }, [resume, key]);

  const pages = Math.max(1, breaks.length - 1);
  useLayoutEffect(() => onPages?.(pages), [pages, onPages]);
  const fullH = pages * PAGE_H + (pages - 1) * GAP;

  return (
    <div className={className} style={{ width: PAGE_W * zoom, height: fullH * zoom }}>
      <style>{RESUME_CSS + SLICE_CSS}</style>
      <div
        aria-label={`Resume preview, ${key} template, ${pages} ${pages === 1 ? "page" : "pages"}`}
        className="relative origin-top-left"
        style={{ width: PAGE_W, transform: `scale(${zoom})` }}
      >
        {/* Hidden layout pass, only for measuring page breaks. */}
        <div ref={measure} aria-hidden="true" className="rp-slice pointer-events-none invisible absolute top-0 left-0" style={{ width: PAGE_W }}>
          <ResumeTemplate resume={resume} template={key} />
        </div>
        <div className="flex flex-col" style={{ gap: GAP }}>
          {Array.from({ length: pages }, (_, i) => {
            const from = breaks[i]!;
            const to = breaks[i + 1] ?? from + CONTENT_H;
            return (
              <div
                key={i}
                id={i === 0 ? undefined : `resume-page-${i + 1}`}
                className="relative flex-none overflow-hidden bg-white shadow-[0_12px_40px_rgba(0,0,0,0.22)]"
                style={{ width: PAGE_W, height: PAGE_H }}
              >
                <div className="absolute inset-x-0 overflow-hidden" style={{ top: MARGIN_Y, height: Math.min(CONTENT_H, to - from) }}>
                  <div className="rp-slice" style={{ transform: `translateY(${-from}px)` }}>
                    <ResumeTemplate resume={resume} template={key} />
                  </div>
                </div>
                {pages > 1 ? (
                  <span aria-hidden="true" className="absolute right-3 bottom-2 font-mono text-[11px] text-[#9AA8B8]">
                    Page {i + 1} of {pages}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});
