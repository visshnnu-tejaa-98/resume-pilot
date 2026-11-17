"use client";

import { SECTION_LABELS } from "@resume-pilot/resume-templates";
import type { Resume } from "@resume-pilot/validators/resume";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { PAGE_W, ResumeDocument } from "@/components/resume/ResumeDocument";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Chip } from "@/components/ui/Chip";
import type { VersionView } from "@/features/versions/types";
import { cn } from "@/lib/cn";
import { appRoutes, routes } from "@/lib/routes";
import { trpc, trpcErrorMessage } from "@/lib/trpc-client";
import { orderedSections, useEditorStore, type BulletSection, type ListSection } from "@/stores/editor-store";
import { TEMPLATES } from "@/stores/preferences-store";
import { EyeButton, IconButton, Labeled, ListField, SortableList, inputCls } from "./parts";

/** Autosave delay after the last keystroke. */
const AUTOSAVE_MS = 800;

const label = (r: Resume, key: string) => (key.startsWith("custom:") ? r.customSections.find((c) => `custom:${c.id}` === key)?.title || "Custom section" : (SECTION_LABELS[key] ?? key));

/**
 * Split-screen editor (prd.md §10.1, design/screens/Editor.dc.html):
 * section list, form for the active section, live A4 preview rendered by
 * the same template code as the PDF. Edits autosave; saving changes the
 * content hash, which marks cached ATS reports outdated.
 */
export function EditorView({ version }: { version: VersionView }) {
  const loaded = useEditorStore((s) => s.versionId === version.id && !!s.content);
  useEffect(() => {
    const s = useEditorStore.getState();
    // Fresh server copy unless this tab still has unsaved edits for it.
    if (s.versionId !== version.id || s.revision === s.savedRevision) s.load(version);
  }, [version]);
  if (!loaded) return <div className="p-8 text-sm text-text-2">Loading editor…</div>;
  return <Editor version={version} />;
}

function useAutosave(versionId: string, enabled: boolean) {
  const revision = useEditorStore((s) => s.revision);
  const savedRevision = useEditorStore((s) => s.savedRevision);
  const saving = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const flush = useCallback(async () => {
    if (saving.current) return;
    const { revision: rev, content, savedRevision: done, markSaved } = useEditorStore.getState();
    if (!content || rev === done) return;
    saving.current = true;
    setBusy(true);
    try {
      await trpc.versions.save.mutate({ versionId, content });
      markSaved(rev);
      setError(null);
    } catch (err) {
      setError(trpcErrorMessage(err, "Couldn't save. We'll retry on your next change."));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }, [versionId]);

  useEffect(() => {
    if (!enabled || revision === savedRevision) return;
    const t = setTimeout(() => void flush(), AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [enabled, revision, savedRevision, flush, busy]);

  // Warn before leaving with edits that haven't reached the server.
  useEffect(() => {
    if (revision === savedRevision) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [revision, savedRevision]);

  return { pending: revision !== savedRevision, busy, error, flush };
}

function Editor({ version }: { version: VersionView }) {
  const content = useEditorStore((s) => s.content)!;
  const template = useEditorStore((s) => s.template);
  const active = useEditorStore((s) => s.active);
  const zoom = useEditorStore((s) => s.zoom);
  const scoreOutdated = useEditorStore((s) => s.scoreOutdated);
  const savedAt = useEditorStore((s) => s.savedAt);
  const st = useEditorStore.getState();
  const isOriginal = version.kind === "original";
  const save = useAutosave(version.id, !isOriginal);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const previewBox = useRef<HTMLDivElement>(null);

  const sections = orderedSections(content);
  const hidden = new Set<string>(content.layout.hiddenSections);
  const score = version.score;

  async function pickTemplate(name: (typeof TEMPLATES)[number]) {
    const prev = useEditorStore.getState().template;
    st.setTemplate(name);
    setTemplateError(null);
    try {
      await trpc.versions.setTemplate.mutate({ versionId: version.id, template: name.toLowerCase() });
    } catch (err) {
      st.setTemplate(prev);
      setTemplateError(trpcErrorMessage(err, "Couldn't change the template."));
    }
  }

  function goToPage(n: number) {
    const box = previewBox.current;
    if (!box) return;
    setPage(n);
    const target = n === 1 ? null : box.querySelector<HTMLElement>(`#resume-page-${n}`);
    const top = target ? target.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 24 : 0;
    box.scrollTo({ top, behavior: "smooth" });
  }

  function fit() {
    const w = previewBox.current?.clientWidth ?? PAGE_W;
    st.zoomTo(Math.max(0.4, Math.min(1.5, Math.floor(((w - 48) / PAGE_W) * 20) / 20)));
  }

  const status = save.error ? (
    <span className="text-crit">{save.error}</span>
  ) : isOriginal ? (
    "read-only here"
  ) : save.busy ? (
    "saving…"
  ) : save.pending ? (
    "unsaved changes"
  ) : savedAt ? (
    `saved ${new Date(savedAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`
  ) : (
    "saved"
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
          <span className="text-xs text-text-2" role="status" aria-live="polite">
            {isOriginal ? "Original" : `Tailored from ${version.sourceLabel}`} · {status}
          </span>
        </div>
        <div role="radiogroup" aria-label="Template" className="ml-auto flex flex-wrap gap-1 rounded-lg bg-surface-2 p-1">
          {TEMPLATES.map((name) => (
            <button
              key={name}
              type="button"
              role="radio"
              aria-checked={name === template}
              onClick={() => void pickTemplate(name)}
              className={cn("h-8 cursor-pointer rounded-md border-0 px-3 text-[13px]", name === template ? "bg-surface font-semibold text-text shadow-sm" : "bg-transparent font-medium text-text-2 hover:text-text")}
            >
              {name}
            </button>
          ))}
        </div>
        <ButtonLink href={appRoutes.versionReport(version.id)} variant="outline" className="h-[38px] gap-2 border-border-strong px-3.5 text-sm">
          ATS score
          {score ? (
            <Chip tone={scoreOutdated ? "warn" : "good"} mono className="rounded px-1.5 py-0.5 text-xs">
              {score.value}
            </Chip>
          ) : null}
        </ButtonLink>
        <ButtonLink href={appRoutes.versionPreview(version.id)} className="h-[38px] px-4 text-sm" onClick={() => void save.flush()}>
          Download PDF
        </ButtonLink>
      </div>
      {templateError ? (
        <Callout tone="warn" role="alert" className="mx-5 mt-3">
          {templateError}
        </Callout>
      ) : null}

      <div className="flex flex-1 flex-wrap items-stretch">
        {/* Sections: drag (or arrow keys on the handle) to reorder; eye to hide. */}
        <nav aria-label="Sections" className="box-border flex flex-[0_1_230px] flex-col gap-0.5 border-r border-border bg-surface px-2.5 py-4 max-md:flex-[1_1_100%] max-md:border-r-0 max-md:border-b">
          <span className="px-2.5 pb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-text-2">Sections</span>
          <NavRow on={active === "personal"} onClick={() => st.setActive("personal")} label="Personal info" />
          <SortableList
            group="sections"
            items={sections.map((k) => ({ id: k }))}
            disabled={isOriginal}
            onMove={st.moveSection}
            itemLabel={(x) => label(content, x.id)}
            render={({ id }, handle) => (
              <NavRow
                on={id === active}
                onClick={() => st.setActive(id)}
                label={label(content, id)}
                muted={hidden.has(id)}
                handle={handle}
                trailing={<EyeButton visible={!hidden.has(id)} name={label(content, id)} disabled={isOriginal} onClick={() => st.toggleSection(id)} />}
              />
            )}
          />
          {!isOriginal ? (
            <button type="button" onClick={() => st.addCustomSection()} className="mt-2 h-9 cursor-pointer rounded-md border border-dashed border-border-strong bg-transparent text-[13px] font-semibold text-link hover:bg-surface-2">
              + Add custom section
            </button>
          ) : null}
        </nav>

        {/* Form */}
        <section aria-label="Edit section" className="box-border flex min-w-0 flex-[1_1_440px] flex-col gap-4 p-5">
          {isOriginal ? (
            <Callout tone="info">
              This is your original. Edit it on the{" "}
              <Link href={routes.resumes} className="font-semibold text-link">
                review screen
              </Link>
              ; tailored versions are edited here. You can still pick a template.
            </Callout>
          ) : null}
          <fieldset disabled={isOriginal} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
            <SectionForm pane={active} content={content} version={version} />
          </fieldset>

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
              <span className="text-xs leading-normal text-text-2">We never add these for you. Add one yourself only if it&apos;s true.</span>
            </section>
          ) : null}
        </section>

        {/* Live preview */}
        <section aria-label="Live preview" className="box-border flex min-w-0 flex-[1_1_560px] flex-col bg-canvas">
          <div className="flex flex-wrap items-center justify-center gap-2 border-b border-border px-4 py-2 text-[13px] text-text-2">
            <IconButton label="Zoom out" onClick={() => st.zoomBy(-0.1)}>
              −
            </IconButton>
            <span className="w-11 text-center font-mono">{Math.round(zoom * 100)}%</span>
            <IconButton label="Zoom in" onClick={() => st.zoomBy(0.1)}>
              +
            </IconButton>
            <button type="button" onClick={fit} className="h-[30px] cursor-pointer rounded-md border border-border bg-surface px-2.5 text-text">
              Fit
            </button>
            <span className="mx-2 h-5 w-px bg-border" />
            <IconButton label="Previous page" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
              ‹
            </IconButton>
            <span className="font-mono">
              {Math.min(page, pages)} / {pages}
            </span>
            <IconButton label="Next page" disabled={page >= pages} onClick={() => goToPage(page + 1)}>
              ›
            </IconButton>
            <span className="ml-2">A4</span>
          </div>
          <div ref={previewBox} className="flex max-h-[calc(100vh-130px)] flex-1 justify-center overflow-auto p-6">
            <ResumeDocument resume={content} template={template} zoom={zoom} onPages={setPages} />
          </div>
        </section>
      </div>
    </div>
  );
}

function NavRow({ on, onClick, label, muted, handle, trailing }: { on: boolean; onClick: () => void; label: string; muted?: boolean; handle?: React.ReactNode; trailing?: React.ReactNode }) {
  return (
    <div className={cn("flex h-[38px] items-center gap-1.5 rounded-md pr-1.5 pl-1", on && "bg-surface-2")}>
      {handle ?? <span className="w-6" />}
      <button type="button" aria-current={on ? "true" : undefined} onClick={onClick} className={cn("min-w-0 flex-1 cursor-pointer truncate border-0 bg-transparent p-0 text-left text-sm", on ? "font-semibold" : "font-medium", muted ? "text-text-2 line-through decoration-border-strong" : "text-text")}>
        {label}
      </button>
      {trailing}
    </div>
  );
}

/* ---------- Forms ---------- */

function SectionForm({ pane, content, version }: { pane: string; content: Resume; version: VersionView }) {
  const st = useEditorStore.getState();
  const h = (t: string) => <h2 className="m-0 font-display text-xl font-bold">{t}</h2>;

  if (pane === "personal") {
    const p = content.personalInfo;
    const f = (k: "firstName" | "lastName" | "headline" | "email" | "phone" | "location", l: string) => (
      <Labeled label={l}>
        <input value={p[k]} onChange={(e) => st.setPersonal(k, e.target.value)} className={cn(inputCls, "h-[38px]")} />
      </Labeled>
    );
    return (
      <>
        {h("Personal info")}
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(180px, 100%), 1fr))" }}>
          {f("firstName", "First name")}
          {f("lastName", "Last name")}
          {f("headline", "Headline")}
          {f("email", "Email")}
          {f("phone", "Phone")}
          {f("location", "Location")}
        </div>
        <Labeled label="Links (one per line)">
          <ListField value={p.links.map((l) => l.url)} onCommit={st.setLinks} separator="line" />
        </Labeled>
      </>
    );
  }

  if (pane === "summary") {
    return (
      <>
        {h("Summary")}
        <textarea rows={6} aria-label="Summary" value={content.summary.text} onChange={(e) => st.editSummary(e.target.value)} className={cn(inputCls, "resize-y py-2.5 leading-[1.6]")} />
      </>
    );
  }

  if (pane === "skills") {
    return (
      <ItemList section="skills" title="Skills" items={content.skills} content={content} addLabel="Add skill group" itemName={(g) => g.category || "Skill group"}>
        {(g) => (
          <>
            <Labeled label="Category">
              <input value={g.category} placeholder="e.g. Languages" onChange={(e) => st.editItem("skills", g.id, { category: e.target.value })} className={cn(inputCls, "h-[38px]")} />
            </Labeled>
            <Labeled label="Skills (comma-separated)">
              <ListField value={g.items.map((i) => i.name)} onCommit={(names) => st.setSkillNames(g.id, names)} />
            </Labeled>
          </>
        )}
      </ItemList>
    );
  }

  if (pane === "workExperience") {
    return (
      <ItemList section="workExperience" title="Work experience" items={content.workExperience} content={content} addLabel="Add role" itemName={(r) => [r.designation, r.company].filter(Boolean).join(" · ") || "New role"}>
        {(r) => (
          <>
            <Grid>
              <Text section="workExperience" item={r} field="designation" label="Designation" />
              <Text section="workExperience" item={r} field="company" label="Company" />
              <Text section="workExperience" item={r} field="location" label="Location" />
              <Dates section="workExperience" id={r.id} value={[r.startDate.raw, r.isCurrent ? "Present" : r.endDate.raw]} />
            </Grid>
            <Bullets section="workExperience" itemId={r.id} bullets={r.bullets} version={version} content={content} />
          </>
        )}
      </ItemList>
    );
  }

  if (pane === "education") {
    return (
      <ItemList section="education" title="Education" items={content.education} content={content} addLabel="Add education" itemName={(e) => e.degree || e.institution || "New entry"}>
        {(e) => (
          <>
            <Grid>
              <Text section="education" item={e} field="degree" label="Degree" />
              <Text section="education" item={e} field="fieldOfStudy" label="Field of study" />
              <Text section="education" item={e} field="institution" label="Institution" />
              <Text section="education" item={e} field="location" label="Location" />
              <Dates section="education" id={e.id} value={[e.startDate.raw, e.endDate.raw]} />
              <Labeled label="Grade">
                <input value={e.grade.value} onChange={(ev) => st.editItem("education", e.id, { grade: { ...e.grade, value: ev.target.value.slice(0, 20) } })} className={cn(inputCls, "h-[38px]")} />
              </Labeled>
            </Grid>
            <Bullets section="education" itemId={e.id} bullets={e.bullets} version={version} content={content} />
          </>
        )}
      </ItemList>
    );
  }

  if (pane === "projects") {
    return (
      <ItemList section="projects" title="Projects" items={content.projects} content={content} addLabel="Add project" itemName={(p) => p.name || "New project"}>
        {(p) => (
          <>
            <Grid>
              <Text section="projects" item={p} field="name" label="Name" />
              <Text section="projects" item={p} field="role" label="Role" />
              <Text section="projects" item={p} field="url" label="Link" />
              <Dates section="projects" id={p.id} value={[p.startDate.raw, p.endDate.raw]} />
            </Grid>
            <Labeled label="Technologies (comma-separated)">
              <ListField value={p.technologies} onCommit={(t) => st.editItem("projects", p.id, { technologies: t.slice(0, 50) })} />
            </Labeled>
            <Bullets section="projects" itemId={p.id} bullets={p.bullets} version={version} content={content} />
          </>
        )}
      </ItemList>
    );
  }

  if (pane === "certifications") {
    return (
      <ItemList section="certifications" title="Certifications" items={content.certifications} content={content} addLabel="Add certification" itemName={(c) => c.name || "New certification"}>
        {(c) => (
          <Grid>
            <Text section="certifications" item={c} field="name" label="Name" />
            <Text section="certifications" item={c} field="issuer" label="Issuer" />
            <Dates section="certifications" id={c.id} value={[c.issueDate.raw]} label="Issued" />
            <Text section="certifications" item={c} field="credentialId" label="Credential ID" />
            <Text section="certifications" item={c} field="credentialUrl" label="Credential link" />
          </Grid>
        )}
      </ItemList>
    );
  }

  if (pane.startsWith("custom:")) {
    const cs = content.customSections.find((c) => `custom:${c.id}` === pane);
    if (!cs) return null;
    return (
      <>
        <div className="flex items-end gap-3">
          <Labeled label="Section title" className="flex-1">
            <input value={cs.title} onChange={(e) => st.editItem("customSections", cs.id, { title: e.target.value.slice(0, 100) })} className={cn(inputCls, "h-[38px] font-display text-lg font-bold")} />
          </Labeled>
          <Button variant="outline" className="h-[38px] px-3 text-sm text-crit" onClick={() => st.removeCustomSection(cs.id)}>
            Delete section
          </Button>
        </div>
        <ItemList section="customSections" customId={cs.id} items={cs.items} content={content} addLabel="Add entry" itemName={(i) => i.heading || "New entry"}>
          {(i) => (
            <>
              <Grid>
                <Text section="customSections" customId={cs.id} item={i} field="heading" label="Heading" />
                <Text section="customSections" customId={cs.id} item={i} field="subheading" label="Subheading" />
                <Dates section="customSections" customId={cs.id} id={i.id} value={[i.date.raw]} label="Date" />
              </Grid>
              <Bullets section="customSections" customId={cs.id} itemId={i.id} bullets={i.bullets} version={version} content={content} />
            </>
          )}
        </ItemList>
      </>
    );
  }
  return null;
}

const Grid = ({ children }: { children: React.ReactNode }) => (
  <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(170px, 100%), 1fr))" }}>
    {children}
  </div>
);

function Text<T extends { id: string }>({ section, item, field, label, customId }: { section: ListSection; item: T; field: keyof T & string; label: string; customId?: string }) {
  return (
    <Labeled label={label}>
      <input
        value={String(item[field] ?? "")}
        onChange={(e) => useEditorStore.getState().editItem(section, item.id, { [field]: e.target.value.slice(0, 500) }, customId)}
        className={cn(inputCls, "h-[38px]")}
      />
    </Labeled>
  );
}

/** Dates as typed text ("Jan 2021 – Present"), parsed on blur. */
function Dates({ section, id, value, label = "Dates", customId }: { section: ListSection; id: string; value: string[]; label?: string; customId?: string }) {
  const text = value.filter(Boolean).join(" – ");
  return (
    <Labeled label={label}>
      <input key={text} defaultValue={text} placeholder="Jan 2021 – Present" onBlur={(e) => e.target.value !== text && useEditorStore.getState().setDates(section, id, e.target.value, customId)} className={cn(inputCls, "h-[38px]")} />
    </Labeled>
  );
}

/** A sortable list of item cards with add, delete and hide. */
function ItemList<T extends { id: string }>({
  section,
  customId,
  title,
  items,
  content,
  addLabel,
  itemName,
  children,
}: {
  section: ListSection;
  customId?: string;
  title?: string;
  items: T[];
  content: Resume;
  addLabel: string;
  itemName: (x: T) => string;
  children: (x: T) => React.ReactNode;
}) {
  const st = useEditorStore.getState();
  const hiddenItems = new Set(content.layout.hiddenItems);
  return (
    <>
      {title ? <h2 className="m-0 font-display text-xl font-bold">{title}</h2> : null}
      {items.length === 0 ? <p className="m-0 text-sm text-text-2">Nothing here yet.</p> : null}
      <SortableList
        group={`${section}:${customId ?? ""}`}
        items={items}
        onMove={(a, b) => st.moveItem(section, a, b, customId)}
        itemLabel={itemName}
        render={(x, handle) => {
          const isHidden = hiddenItems.has(x.id);
          return (
            <div id={`item-${x.id}`} className={cn("flex scroll-mt-24 flex-col gap-3.5 rounded-xl border border-border bg-surface p-[18px] target:ring-2 target:ring-accent", isHidden && "opacity-60")}>
              <div className="-mt-1 flex items-center gap-2">
                {handle}
                <strong className="min-w-0 flex-1 truncate text-[15px]">
                  {itemName(x)}
                  {isHidden ? <span className="ml-2 text-xs font-normal text-text-2">Hidden</span> : null}
                </strong>
                <EyeButton visible={!isHidden} name={itemName(x)} onClick={() => st.toggleItemHidden(x.id)} />
                <IconButton label={`Delete ${itemName(x)}`} onClick={() => st.removeItem(section, x.id, customId)} className="text-crit">
                  ×
                </IconButton>
              </div>
              {children(x)}
            </div>
          );
        }}
      />
      <button
        type="button"
        onClick={() => {
          const id = st.addItem(section, customId);
          requestAnimationFrame(() => document.getElementById(`item-${id}`)?.querySelector("input")?.focus());
        }}
        className="h-10 cursor-pointer rounded-lg border border-dashed border-border-strong bg-transparent text-sm font-semibold text-link hover:bg-surface-2 disabled:cursor-default disabled:opacity-50"
      >
        + {addLabel}
      </button>
    </>
  );
}

function Bullets({ section, itemId, bullets, version, content, customId }: { section: BulletSection | "customSections"; itemId: string; bullets: { id: string; text: string }[]; version: VersionView; content: Resume; customId?: string }) {
  const st = useEditorStore.getState();
  const userEdited = useEditorStore((s) => s.userEdited);
  const [showOriginal, setShowOriginal] = useState<Set<string>>(new Set());
  const hiddenItems = new Set(content.layout.hiddenItems);

  const origin = (bulletId: string) => {
    if (userEdited.has(bulletId)) return { label: "Edited by you", tone: "warn" as const };
    const p = version.provenance[`${itemId}.bullets[${bulletId}]`];
    if (p && (p.changeType === "rewritten" || p.changeType === "merged")) return { label: "AI rewrite", tone: "info" as const };
    return { label: "From original", tone: "neutral" as const };
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13px] font-semibold">Bullets</span>
      <SortableList
        group={`bullets:${itemId}`}
        items={bullets}
        onMove={(a, b) => st.moveBullet(section, itemId, a, b, customId)}
        itemLabel={(b) => `bullet “${b.text.slice(0, 30)}”`}
        render={(b, handle) => {
          const o = origin(b.id);
          const original = version.sourceBulletTexts[b.id];
          const showing = showOriginal.has(b.id);
          const isHidden = hiddenItems.has(b.id);
          return (
            <div id={`item-${b.id}`} className={cn("flex scroll-mt-24 flex-col gap-1.5 rounded-lg bg-surface-2 p-3 target:ring-2 target:ring-accent", isHidden && "opacity-60")}>
              <div className="flex items-start gap-1.5">
                <span className="pt-1.5">{handle}</span>
                <textarea
                  rows={2}
                  aria-label="Bullet text"
                  value={b.text}
                  onChange={(e) => st.editBullet(section, itemId, b.id, e.target.value.slice(0, 1000), customId)}
                  className={cn(inputCls, "min-w-0 flex-1 resize-y py-2 leading-normal")}
                />
                <div className="flex flex-col">
                  <EyeButton visible={!isHidden} name="bullet" onClick={() => st.toggleItemHidden(b.id)} />
                  <IconButton label="Delete bullet" onClick={() => st.removeBullet(section, itemId, b.id, customId)} className="text-crit">
                    ×
                  </IconButton>
                </div>
              </div>
              <div className="flex items-center gap-3 pl-8 text-xs">
                {o ? (
                  <Chip tone={o.tone} pill className="px-2 py-0.5 text-xs font-semibold">
                    {o.label}
                  </Chip>
                ) : null}
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
              {showing && original ? <p className="m-0 pl-8 text-[13px] leading-normal text-text-2">Original: “{original}”</p> : null}
            </div>
          );
        }}
      />
      <button type="button" onClick={() => st.addBullet(section, itemId, customId)} className="self-start cursor-pointer border-0 bg-transparent p-0 text-[13px] font-semibold text-link disabled:cursor-default disabled:opacity-50">
        + Add bullet
      </button>
    </div>
  );
}
