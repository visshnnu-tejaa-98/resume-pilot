"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ResumeDocument } from "@/components/resume/ResumeDocument";
import { GRIP_PATH } from "@/components/review/parts";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Chip } from "@/components/ui/Chip";
import { resumeToDoc, SECTION_LABELS } from "@/features/versions/doc";
import type { VersionView } from "@/features/versions/types";
import { cn } from "@/lib/cn";
import { appRoutes, routes } from "@/lib/routes";
import { trpc, trpcErrorMessage } from "@/lib/trpc-client";
import { EDITABLE_SECTIONS, useEditorStore, type EditableSection } from "@/stores/editor-store";
import { TEMPLATES } from "@/stores/preferences-store";

const EYE_ON = "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z";
const EYE_OFF = "M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 3.9M6.6 6.6C3.9 8.4 2 12 2 12s4 7 10 7a9.7 9.7 0 0 0 5.4-1.6";

const input =
  "box-border rounded-md border border-border-strong bg-input-bg px-2.5 text-sm font-normal text-text outline-none focus-visible:border-link";

/**
 * Version editor (design/screens/Editor.dc.html): toolbar, section list,
 * edit form and live A4 preview, all bound to the editor store.
 */
export function EditorView({ version }: { version: VersionView }) {
  const load = useEditorStore((s) => s.load);
  const loaded = useEditorStore((s) => s.versionId === version.id && !!s.content);
  useEffect(() => load(version), [load, version]);
  if (!loaded) return <div className="p-8 text-sm text-text-2">Loading editor…</div>;
  return <Editor version={version} />;
}

function Editor({ version }: { version: VersionView }) {
  const router = useRouter();
  const { content, template, activeSection, zoom, dirty, scoreOutdated, savedAt, userEdited } = useEditorStore();
  const { setTemplate, toggleSection, setActive, editBullet, editRole, editSummary, zoomBy, markSaved } = useEditorStore.getState();
  const [showOriginal, setShowOriginal] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const doc = useMemo(() => (content ? resumeToDoc(content) : null), [content]);

  // Warn before leaving with unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  if (!content || !doc) return null;
  const hidden = new Set(content.layout.hiddenSections);
  const score = version.score;
  const isOriginal = version.kind === "original";

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      await trpc.versions.save.mutate({ versionId: version.id, content: useEditorStore.getState().content });
      markSaved();
      router.refresh();
    } catch (err) {
      setSaveError(trpcErrorMessage(err, "Couldn't save. Please try again."));
    } finally {
      setSaving(false);
    }
  }

  const origin = (bulletId: string, parentId: string) => {
    if (userEdited.has(bulletId)) return { label: "Edited by you", tone: "warn" as const };
    const p = version.provenance[`${parentId}.bullets[${bulletId}]`];
    if (p && (p.changeType === "rewritten" || p.changeType === "merged")) return { label: "AI rewrite", tone: "info" as const };
    return { label: "From original", tone: "neutral" as const };
  };

  const BulletEditor = ({ section, parentId, bullets }: { section: "workExperience" | "projects"; parentId: string; bullets: { id: string; text: string }[] }) => (
    <>
      {bullets.map((b, i) => {
        const o = origin(b.id, parentId);
        const original = version.sourceBulletTexts[b.id];
        const showing = showOriginal.has(b.id);
        return (
          <div key={b.id} id={`item-${b.id}`} className="flex scroll-mt-24 flex-col gap-1.5 rounded-lg bg-surface-2 p-3 target:ring-2 target:ring-accent">
            <div className="flex items-start gap-2">
              <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" className="mt-2.5 flex-none text-border-strong">
                <path d={GRIP_PATH} stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
              </svg>
              <textarea
                rows={2}
                aria-label={`Bullet ${i + 1}`}
                value={b.text}
                disabled={isOriginal}
                onChange={(e) => editBullet(section, parentId, b.id, e.target.value)}
                className={cn(input, "min-w-0 flex-1 resize-y py-2 leading-normal")}
              />
            </div>
            <div className="flex items-center gap-3 pl-5 text-xs">
              <Chip tone={o.tone} pill className="px-2 py-0.5 text-xs font-semibold">
                {o.label}
              </Chip>
              {original ? (
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
            {showing && original ? <p className="m-0 pl-5 text-[13px] leading-normal text-text-2">Original: “{original}”</p> : null}
          </div>
        );
      })}
    </>
  );

  return (
    <div className="flex min-h-[calc(100vh-64px)] flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border bg-surface px-5 py-2.5">
        <Link href={routes.resumes} aria-label="Back to my resumes" className="flex size-9 items-center justify-center rounded-md border border-border text-text hover:bg-surface-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </Link>
        <div className="flex min-w-0 flex-col gap-px">
          <strong className="truncate font-display text-[17px]">{[version.company, version.role].filter(Boolean).join(" · ")}</strong>
          <span className="text-xs text-text-2" role="status">
            {isOriginal ? "Original" : `Tailored from ${version.sourceLabel}`} ·{" "}
            {saveError ? <span className="text-crit">{saveError}</span> : dirty ? "unsaved changes" : savedAt ? `saved ${new Date(savedAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}` : "saved"}
          </span>
        </div>
        <div role="radiogroup" aria-label="Template" className="ml-auto flex flex-wrap gap-1 rounded-lg bg-surface-2 p-1">
          {TEMPLATES.map((name) => (
            <button
              key={name}
              type="button"
              role="radio"
              aria-checked={name === template}
              onClick={() => setTemplate(name)}
              className={cn("h-8 cursor-pointer rounded-md border-0 px-3 text-[13px]", name === template ? "bg-surface font-semibold text-text shadow-sm" : "bg-transparent font-medium text-text-2 hover:text-text")}
            >
              {name}
            </button>
          ))}
        </div>
        {!isOriginal ? (
          <Button variant="outline" className="h-[38px] border-border-strong px-3.5 text-sm" disabled={!dirty || saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save"}
          </Button>
        ) : null}
        <ButtonLink href={appRoutes.versionReport(version.id)} variant="outline" className="h-[38px] gap-2 border-border-strong px-3.5 text-sm">
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
          {EDITABLE_SECTIONS.map((s: EditableSection) => {
            const on = s === activeSection;
            const visible = !hidden.has(s);
            return (
              <div key={s} className={cn("flex h-[38px] items-center gap-2 rounded-md pr-2 pl-2.5", on && "bg-surface-2")}>
                <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" className="flex-none text-border-strong">
                  <path d={GRIP_PATH} stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
                </svg>
                <button type="button" onClick={() => setActive(s)} className={cn("flex-1 cursor-pointer border-0 bg-transparent p-0 text-left text-sm", on ? "font-semibold" : "font-medium", visible ? "text-text" : "text-text-2")}>
                  {SECTION_LABELS[s]}
                </button>
                <button
                  type="button"
                  aria-label={`${visible ? "Hide" : "Show"} ${SECTION_LABELS[s]}`}
                  aria-pressed={!visible}
                  disabled={isOriginal}
                  onClick={() => toggleSection(s)}
                  className={cn("flex size-7 cursor-pointer items-center justify-center border-0 bg-transparent p-0 disabled:cursor-default", visible ? "text-text-2" : "text-border-strong")}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d={visible ? EYE_ON : EYE_OFF} />
                  </svg>
                </button>
              </div>
            );
          })}
        </nav>

        {/* Form */}
        <section aria-label="Edit section" className="box-border flex min-w-0 flex-[1_1_420px] flex-col gap-4 p-5">
          {isOriginal ? (
            <Callout tone="info">
              This is your original. Edit it on the{" "}
              <Link href={`${routes.resumes}`} className="font-semibold text-link">
                review screen
              </Link>
              ; tailored versions are edited here.
            </Callout>
          ) : null}

          {activeSection === "summary" ? (
            <>
              <h2 className="m-0 font-display text-xl font-bold">Summary</h2>
              <textarea rows={5} aria-label="Summary" value={content.summary.text} disabled={isOriginal} onChange={(e) => editSummary(e.target.value)} className={cn(input, "resize-y py-2.5 leading-[1.6]")} />
            </>
          ) : null}

          {activeSection === "workExperience" ? (
            <>
              <h2 className="m-0 font-display text-xl font-bold">Work experience</h2>
              {content.workExperience.map((r) => (
                <div key={r.id} className="flex flex-col gap-3.5 rounded-xl border border-border bg-surface p-[18px]">
                  <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(150px, 100%), 1fr))" }}>
                    <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
                      Company
                      <input value={r.company} disabled={isOriginal} onChange={(e) => editRole(r.id, { company: e.target.value })} className={cn(input, "h-[38px]")} />
                    </label>
                    <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
                      Designation
                      <input value={r.designation} disabled={isOriginal} onChange={(e) => editRole(r.id, { designation: e.target.value })} className={cn(input, "h-[38px]")} />
                    </label>
                    <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
                      Dates
                      <input
                        defaultValue={[r.startDate.raw, r.isCurrent ? "Present" : r.endDate.raw].filter(Boolean).join(" – ")}
                        disabled={isOriginal}
                        onBlur={(e) => editRole(r.id, { dates: e.target.value })}
                        className={cn(input, "h-[38px]")}
                      />
                    </label>
                  </div>
                  <span className="text-[13px] font-semibold">Bullets</span>
                  <BulletEditor section="workExperience" parentId={r.id} bullets={r.bullets} />
                </div>
              ))}
            </>
          ) : null}

          {activeSection === "projects" ? (
            <>
              <h2 className="m-0 font-display text-xl font-bold">Projects</h2>
              {content.projects.length === 0 ? <p className="m-0 text-sm text-text-2">No projects in this version.</p> : null}
              {content.projects.map((p) => (
                <div key={p.id} className={cn("flex flex-col gap-3 rounded-xl border border-border bg-surface p-[18px]", content.layout.hiddenItems.includes(p.id) && "opacity-60")}>
                  <strong className="text-[15px]">
                    {p.name}
                    {content.layout.hiddenItems.includes(p.id) ? <span className="ml-2 text-xs font-normal text-text-2">Hidden for this job</span> : null}
                  </strong>
                  <BulletEditor section="projects" parentId={p.id} bullets={p.bullets} />
                </div>
              ))}
            </>
          ) : null}

          {activeSection === "skills" || activeSection === "education" || activeSection === "certifications" ? (
            <div className="rounded-xl border border-dashed border-border-strong bg-surface p-6 text-sm leading-normal text-text-2">
              {SECTION_LABELS[activeSection]} are shown as they are in your resume. To change them, edit your original resume and tailor again, so tailored versions stay grounded in your own facts. You can hide the section with the eye icon.
            </div>
          ) : null}

          {!isOriginal ? <span className="text-xs text-text-2">You&apos;re responsible for the accuracy of anything you add manually.</span> : null}

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

          {version.gaps.length ? (
            <section aria-label="Gaps" className="flex flex-col gap-2.5 rounded-xl border border-border bg-surface p-[18px]">
              <strong className="text-sm">What this job asks for that your resume doesn&apos;t show</strong>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {version.gaps.map((g) => (
                  <li key={`${g.requirementId}-${g.keyword}`} className="flex flex-wrap items-baseline gap-2 text-sm">
                    <Chip tone="gap">{g.keyword}</Chip>
                    <span className="text-[13px] text-text-2">{g.note}</span>
                  </li>
                ))}
              </ul>
              <span className="text-xs leading-normal text-text-2">We never add these for you. If you have one, add it to your original resume and tailor again.</span>
            </section>
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
            <span className="ml-3">A4</span>
          </div>
          <ResumeDocument doc={doc} template={template} scale="compact" zoom={zoom / 0.8} />
        </section>
      </div>
    </div>
  );
}
