"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ResumeDocument } from "@/components/resume/ResumeDocument";
import { ButtonLink } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Chip } from "@/components/ui/Chip";
import { GRIP_PATH } from "@/components/review/parts";
import type { EditableBullet, ResumeDoc, VersionView } from "@/features/versions/types";
import { cn } from "@/lib/cn";
import { appRoutes, routes } from "@/lib/routes";
import { useEditorStore } from "@/stores/editor-store";
import { TEMPLATES } from "@/stores/preferences-store";

const EYE_ON = "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z";
const EYE_OFF = "M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 3.9M6.6 6.6C3.9 8.4 2 12 2 12s4 7 10 7a9.7 9.7 0 0 0 5.4-1.6";

const ORIGIN_CHIP: Record<EditableBullet["origin"], { label: string; tone: "info" | "warn" | "neutral" }> = {
  ai: { label: "AI rewrite", tone: "info" },
  user: { label: "Edited by you", tone: "warn" },
  original: { label: "From original", tone: "neutral" },
};

/** Live doc = server doc with the edited work section swapped in. */
function useLiveDoc(base: ResumeDoc): ResumeDoc {
  const work = useEditorStore((s) => s.work);
  return useMemo(
    () => ({
      ...base,
      sections: base.sections.map((sec) =>
        sec.id !== "work" || work.length === 0
          ? sec
          : {
              ...sec,
              items: [
                ...work.map((r) => ({
                  title: [r.designation, r.company].filter(Boolean).join(" · "),
                  date: r.dates,
                  lines: r.bullets.map((b) => `• ${b.text}`),
                })),
                ...sec.items.slice(work.length),
              ],
            },
      ),
    }),
    [base, work],
  );
}

/**
 * Tailored-version editor (design/screens/Editor.dc.html): toolbar,
 * section list, edit form and live A4 preview, all bound to the editor
 * store. Saving and re-scoring arrive with m6/m7.
 */
export function EditorView({ version }: { version: VersionView }) {
  const load = useEditorStore((s) => s.load);
  const loaded = useEditorStore((s) => s.versionId === version.id);
  useEffect(() => load(version), [load, version]);
  if (!loaded) return <div className="p-8 text-sm text-text-2">Loading editor…</div>;
  return <Editor version={version} />;
}

function Editor({ version }: { version: VersionView }) {
  const { template, sections, activeSection, work, zoom, dirty, scoreOutdated } = useEditorStore();
  const { setTemplate, toggleSection, setActive, editBullet, editRole, zoomBy } = useEditorStore.getState();
  const [showOriginal, setShowOriginal] = useState<Set<string>>(new Set());
  const hidden = useMemo(() => new Set(sections.filter((s) => !s.visible).map((s) => s.id)), [sections]);
  const doc = useLiveDoc(version.doc);
  const score = version.score;

  return (
    <div className="flex min-h-[calc(100vh-64px)] flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border bg-surface px-5 py-2.5">
        <Link
          href={routes.resumes}
          aria-label="Back to my resumes"
          className="flex size-9 items-center justify-center rounded-md border border-border text-text hover:bg-surface-2"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </Link>
        <div className="flex min-w-0 flex-col gap-px">
          <strong className="truncate font-display text-[17px]">
            {version.company} · {version.role}
          </strong>
          <span className="text-xs text-text-2">
            Tailored from {version.sourceLabel} · {dirty ? "unsaved changes" : "saved just now"}
          </span>
        </div>
        <div role="radiogroup" aria-label="Template" className="ml-auto flex flex-wrap gap-1 rounded-lg bg-surface-2 p-1">
          {TEMPLATES.map((name) => {
            const on = name === template;
            return (
              <button
                key={name}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setTemplate(name)}
                className={cn(
                  "h-8 cursor-pointer rounded-md border-0 px-3 text-[13px]",
                  on ? "bg-surface font-semibold text-text shadow-sm" : "bg-transparent font-medium text-text-2 hover:text-text",
                )}
              >
                {name}
              </button>
            );
          })}
        </div>
        <ButtonLink
          href={appRoutes.versionReport(version.id)}
          variant="outline"
          className="h-[38px] gap-2 border-border-strong px-3.5 text-sm"
        >
          ATS score
          {score ? (
            <Chip tone={scoreOutdated ? "warn" : "good"} mono className="rounded px-1.5 py-0.5 text-xs">
              {score.value}
            </Chip>
          ) : null}
        </ButtonLink>
        <ButtonLink href={appRoutes.versionPreview(version.id)} className="h-[38px] px-4 text-sm">
          Download PDF
        </ButtonLink>
      </div>

      <div className="flex flex-1 flex-wrap items-stretch">
        {/* Sections */}
        <nav aria-label="Sections" className="box-border flex flex-[0_1_210px] flex-col gap-0.5 border-r border-border bg-surface px-2.5 py-4 max-md:flex-[1_1_100%] max-md:border-r-0 max-md:border-b">
          <span className="px-2.5 pb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-text-2">Sections</span>
          {sections.map((s) => {
            const on = s.id === activeSection;
            return (
              <div key={s.id} className={cn("flex h-[38px] items-center gap-2 rounded-md pr-2 pl-2.5", on && "bg-surface-2")}>
                <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" className="flex-none text-border-strong">
                  <path d={GRIP_PATH} stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
                </svg>
                <button
                  type="button"
                  onClick={() => setActive(s.id)}
                  className={cn(
                    "flex-1 cursor-pointer border-0 bg-transparent p-0 text-left text-sm",
                    on ? "font-semibold" : "font-medium",
                    s.visible ? "text-text" : "text-text-2",
                  )}
                >
                  {s.label}
                </button>
                <button
                  type="button"
                  aria-label={`${s.visible ? "Hide" : "Show"} ${s.label}`}
                  aria-pressed={!s.visible}
                  onClick={() => toggleSection(s.id)}
                  className={cn("flex size-7 cursor-pointer items-center justify-center border-0 bg-transparent p-0", s.visible ? "text-text-2" : "text-border-strong")}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d={s.visible ? EYE_ON : EYE_OFF} />
                  </svg>
                </button>
              </div>
            );
          })}
        </nav>

        {/* Form */}
        <section aria-label="Edit section" className="box-border flex min-w-0 flex-[1_1_420px] flex-col gap-4 p-5">
          {activeSection === "work" ? (
            <>
              <h2 className="m-0 font-display text-xl font-bold">Work experience</h2>
              {work.map((r) => (
                <div key={r.id} className="flex flex-col gap-3.5 rounded-xl border border-border bg-surface p-[18px]">
                  <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(150px, 100%), 1fr))" }}>
                    {(
                      [
                        ["company", "Company"],
                        ["designation", "Designation"],
                        ["dates", "Dates"],
                      ] as const
                    ).map(([k, label]) => (
                      <label key={k} className="flex flex-col gap-1.5 text-[13px] font-semibold">
                        {label}
                        <input
                          value={r[k]}
                          onChange={(e) => editRole(r.id, { [k]: e.target.value })}
                          className="box-border h-[38px] rounded-md border border-border-strong bg-input-bg px-2.5 text-sm font-normal text-text outline-none focus-visible:border-link"
                        />
                      </label>
                    ))}
                  </div>
                  <span className="text-[13px] font-semibold">Bullets</span>
                  {r.bullets.map((b, i) => {
                    const chip = ORIGIN_CHIP[b.origin];
                    const showing = showOriginal.has(b.id);
                    return (
                      <div key={b.id} className="flex flex-col gap-1.5 rounded-lg bg-surface-2 p-3">
                        <div className="flex items-start gap-2">
                          <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" className="mt-2.5 flex-none text-border-strong">
                            <path d={GRIP_PATH} stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
                          </svg>
                          <textarea
                            rows={2}
                            aria-label={`Bullet ${i + 1}`}
                            value={b.text}
                            onChange={(e) => editBullet(r.id, b.id, e.target.value)}
                            className="box-border min-w-0 flex-1 resize-y rounded-md border border-border-strong bg-input-bg px-2.5 py-2 text-sm leading-normal text-text outline-none focus-visible:border-link"
                          />
                        </div>
                        <div className="flex items-center gap-3 pl-5 text-xs">
                          <Chip tone={chip.tone} pill className="px-2 py-0.5 text-xs font-semibold">
                            {chip.label}
                          </Chip>
                          {b.originalText ? (
                            <button
                              type="button"
                              aria-expanded={showing}
                              onClick={() =>
                                setShowOriginal((s) => {
                                  const n = new Set(s);
                                  if (n.has(b.id)) n.delete(b.id);
                                  else n.add(b.id);
                                  return n;
                                })
                              }
                              className="cursor-pointer border-0 bg-transparent p-0 text-xs font-semibold text-link"
                            >
                              {showing ? "Hide original" : "Show original"}
                            </button>
                          ) : null}
                        </div>
                        {showing ? <p className="m-0 pl-5 text-[13px] leading-normal text-text-2">Original: “{b.originalText}”</p> : null}
                      </div>
                    );
                  })}
                  <span className="text-xs text-text-2">You&apos;re responsible for the accuracy of anything you add by hand.</span>
                </div>
              ))}
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-border-strong bg-surface p-6 text-sm text-text-2">
              Editing for “{sections.find((s) => s.id === activeSection)?.label}” opens here. Use the eye icon to show or hide it on the page.
            </div>
          )}
          {scoreOutdated && score ? (
            <Callout tone="warn" role="status" className="items-center px-3.5 py-3 text-[13px]">
              <div className="flex items-center gap-2.5">
                <span className="flex-1">You edited this version. Its ATS score of {score.value} is now outdated.</span>
                <Link href={appRoutes.versionReport(version.id)} className="font-bold text-link">
                  Re-score
                </Link>
              </div>
            </Callout>
          ) : null}
        </section>

        {/* Live preview */}
        <section aria-label="Live preview" className="box-border flex min-w-0 flex-[1_1_520px] flex-col items-center gap-3 bg-canvas p-5">
          <div className="flex items-center gap-2 text-[13px] text-text-2">
            <button type="button" aria-label="Zoom out" onClick={() => zoomBy(-0.1)} className="size-[30px] cursor-pointer rounded-md border border-border bg-surface text-text">
              −
            </button>
            <span className="w-10 text-center font-mono">{Math.round(zoom * 100)}%</span>
            <button type="button" aria-label="Zoom in" onClick={() => zoomBy(0.1)} className="size-[30px] cursor-pointer rounded-md border border-border bg-surface text-text">
              +
            </button>
            <span className="ml-3">Page 1 of 1 · A4</span>
          </div>
          <ResumeDocument doc={doc} template={template} scale="compact" hiddenSections={hidden} zoom={zoom / 0.8} />
        </section>
      </div>
    </div>
  );
}
