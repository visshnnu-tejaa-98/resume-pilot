"use client";

import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@resume-pilot/trpc";
import {
  collectIds,
  IdAllocator,
  type ExtractionMeta,
  type Resume,
} from "@resume-pilot/validators/resume";
import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import * as styles from "@/components/auth-styles";

const client = createTRPCClient<AppRouter>({ links: [httpBatchLink({ url: "/api/trpc" })] });

const WARN = "var(--color-warn, #8F4D00)";
const WARN_BG = "var(--color-warn-bg, #FFF1DC)";
const WARN_LINE = "var(--color-warn-line, #F2CF98)";

const card: CSSProperties = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: 10,
  padding: 20,
  display: "flex",
  flexDirection: "column",
  gap: 14,
};
const smallButton: CSSProperties = {
  font: "600 13px Inter, sans-serif",
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid var(--color-border-strong)",
  background: "var(--color-surface)",
  color: "var(--color-text)",
  cursor: "pointer",
};

type Flags = ExtractionMeta;

/**
 * Edits the original version. A flagged field is highlighted with its
 * reason; the user either fixes it (an edit counts as reviewed, §8.6)
 * or clicks "Looks right". Continue is disabled while any `low` flag is
 * still open — the server enforces the same rule (`resumes.readiness`).
 */
export function ReviewEditor({ resumeId }: { resumeId: string }) {
  const [resume, setResume] = useState<Resume | null>(null);
  const [flags, setFlags] = useState<Flags>({});
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [touched, setTouched] = useState<Set<string>>(new Set());

  useEffect(() => {
    client.resumes.original
      .query({ resumeId })
      .then((v) => {
        setResume(v.content as Resume);
        setFlags((v.extractionMeta ?? {}) as Flags);
      })
      .catch(() => setLoadError("We couldn't load this resume. It may still be processing."));
  }, [resumeId]);

  const alloc = useMemo(() => (resume ? new IdAllocator(collectIds(resume)) : null), [resume === null]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Open = low, not reviewed on the server, not marked or edited here. */
  const isOpen = (path: string) => {
    const f = flags[path];
    return !!f && !f.reviewed && !marked.has(path) && !touched.has(path);
  };
  const openLow = Object.keys(flags).filter((p) => flags[p]!.confidence === "low" && isOpen(p));
  const openInSection = (prefix: string) => openLow.filter((p) => p.startsWith(prefix)).length;

  function update(mutate: (draft: Resume) => void, path?: string) {
    setResume((r) => {
      if (!r) return r;
      const next = structuredClone(r);
      mutate(next);
      return next;
    });
    if (path) setTouched((t) => new Set(t).add(path));
    setDirty(true);
  }

  async function save(): Promise<boolean> {
    if (!resume) return false;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await client.resumes.saveReview.mutate({
        resumeId,
        content: resume,
        reviewedPaths: [...marked],
      });
      setFlags(res.extractionMeta);
      setMarked(new Set());
      setTouched(new Set());
      setDirty(false);
      setSavedAt(new Date());
      return true;
    } catch (err) {
      setSaveError((err as Error).message || "Couldn't save. Please try again.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function continueToJd() {
    if (!(await save())) return;
    const r = await client.resumes.readiness.query({ resumeId });
    if (r.ready) window.location.href = `/jobs/new?resumeId=${resumeId}`;
    else setSaveError(`${r.unreviewed.length} field(s) still need a check.`);
  }

  if (loadError) return <Shell><p>{loadError}</p></Shell>;
  if (!resume || !alloc) return <Shell><p>Loading…</p></Shell>;

  const field = (
    path: string,
    label: string,
    value: string,
    set: (d: Resume, v: string) => void,
    opts: { multiline?: boolean } = {},
  ) => (
    <Field
      key={path}
      label={label}
      value={value}
      multiline={opts.multiline}
      flag={isOpen(path) ? flags[path] : undefined}
      onChange={(v) => update((d) => set(d, v), path)}
      onConfirm={() => setMarked((m) => new Set(m).add(path))}
    />
  );

  const p = resume.personalInfo;

  return (
    <Shell>
      <div className="flex flex-col gap-2">
        <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
          <Link href="/dashboard" style={{ color: "var(--color-link)" }}>Dashboard</Link> / Original
        </span>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 style={{ margin: 0, fontFamily: "'Space Grotesk', Inter, sans-serif", fontSize: 30 }}>
            Review your resume
          </h1>
          {openLow.length > 0 && (
            <span style={{ padding: "4px 10px", borderRadius: 999, background: WARN_BG, color: WARN, fontWeight: 600, fontSize: 13 }}>
              {openLow.length} field{openLow.length === 1 ? "" : "s"} to check
            </span>
          )}
        </div>
        <span style={{ color: "var(--color-text-secondary)" }}>
          This is your original. Fix anything we read wrong; tailored versions are built from it.
        </span>
        <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
          You&apos;re responsible for the accuracy of anything you add manually.
        </span>
      </div>

      <section style={card}>
        <SectionTitle title="Personal information" open={openInSection("personalInfo")} />
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          {field("personalInfo.firstName", "First name", p.firstName, (d, v) => (d.personalInfo.firstName = v))}
          {field("personalInfo.lastName", "Last name", p.lastName, (d, v) => (d.personalInfo.lastName = v))}
          {field("personalInfo.email", "Email", p.email, (d, v) => (d.personalInfo.email = v))}
          {field("personalInfo.phone", "Phone", p.phone, (d, v) => (d.personalInfo.phone = v))}
          {field("personalInfo.location", "Location", p.location, (d, v) => (d.personalInfo.location = v))}
          {field("personalInfo.headline", "Headline", p.headline, (d, v) => (d.personalInfo.headline = v))}
        </div>
      </section>

      <section style={card}>
        <SectionTitle title="Professional summary" />
        {field("summary.text", "Summary", resume.summary.text, (d, v) => (d.summary.text = v), { multiline: true })}
      </section>

      <section style={card}>
        <SectionTitle
          title="Work experience"
          open={openInSection("workExperience")}
          action={
            <button
              type="button"
              style={smallButton}
              onClick={() =>
                update((d) =>
                  d.workExperience.push({
                    id: alloc.take("work"),
                    company: "",
                    designation: "",
                    employmentType: null,
                    location: "",
                    startDate: { value: null, raw: "" },
                    endDate: { value: null, raw: "" },
                    isCurrent: false,
                    bullets: [],
                    skillsUsed: [],
                  }),
                )
              }
            >
              + Add role
            </button>
          }
        />
        {resume.workExperience.map((w, i) => {
          const at = `workExperience[id=${w.id}]`;
          const ix = (d: Resume) => d.workExperience.find((x) => x.id === w.id)!;
          return (
            <Item key={w.id} title={[w.company, w.designation].filter(Boolean).join(" · ") || "New role"} open={openInSection(at)} onRemove={() => update((d) => d.workExperience.splice(i, 1))}>
              <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
                {field(`${at}.company`, "Company", w.company, (d, v) => (ix(d).company = v))}
                {field(`${at}.designation`, "Designation", w.designation, (d, v) => (ix(d).designation = v))}
                {field(`${at}.location`, "Location", w.location, (d, v) => (ix(d).location = v))}
                {field(`${at}.startDate`, "Start", w.startDate.raw, (d, v) => (ix(d).startDate = parseDate(v)))}
                {!w.isCurrent && field(`${at}.endDate`, "End", w.endDate.raw, (d, v) => (ix(d).endDate = parseDate(v)))}
              </div>
              <label className="flex items-center gap-2" style={{ fontSize: 14 }}>
                <input
                  type="checkbox"
                  checked={w.isCurrent}
                  onChange={(e) =>
                    update((d) => {
                      ix(d).isCurrent = e.target.checked;
                      if (e.target.checked) ix(d).endDate = { value: null, raw: "Present" };
                    }, `${at}.endDate`)
                  }
                />
                I currently work here
              </label>
              <Bullets
                bullets={w.bullets}
                pathFor={(id) => `${at}.bullets[id=${id}]`}
                field={field}
                set={(d, id, v) => (ix(d).bullets.find((b) => b.id === id)!.text = v)}
                onAdd={() => update((d) => ix(d).bullets.push({ id: alloc.take("bullet"), text: "", kind: "responsibility" }))}
                onRemove={(id) => update((d) => (ix(d).bullets = ix(d).bullets.filter((b) => b.id !== id)))}
              />
            </Item>
          );
        })}
      </section>

      <section style={card}>
        <SectionTitle title="Education" open={openInSection("education")} />
        {resume.education.map((e, i) => {
          const at = `education[id=${e.id}]`;
          const ix = (d: Resume) => d.education.find((x) => x.id === e.id)!;
          return (
            <Item key={e.id} title={[e.degree, e.institution].filter(Boolean).join(" · ") || "Education"} open={openInSection(at)} onRemove={() => update((d) => d.education.splice(i, 1))}>
              <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
                {field(`${at}.institution`, "Institution", e.institution, (d, v) => (ix(d).institution = v))}
                {field(`${at}.degree`, "Degree", e.degree, (d, v) => (ix(d).degree = v))}
                {field(`${at}.fieldOfStudy`, "Field of study", e.fieldOfStudy, (d, v) => (ix(d).fieldOfStudy = v))}
                {field(`${at}.grade`, "Grade", e.grade.value, (d, v) => (ix(d).grade.value = v))}
                {field(`${at}.startDate`, "Start", e.startDate.raw, (d, v) => (ix(d).startDate = parseDate(v)))}
                {field(`${at}.endDate`, "End", e.endDate.raw, (d, v) => (ix(d).endDate = parseDate(v)))}
              </div>
            </Item>
          );
        })}
      </section>

      <section style={card}>
        <SectionTitle title="Skills" open={openInSection("skills")} />
        {resume.skills.map((g) => (
          <div key={g.id} className="flex flex-col gap-2">
            <strong style={{ fontSize: 14 }}>{g.category}</strong>
            <div className="flex flex-wrap gap-2">
              {g.items.map((s) => {
                const path = `skills[id=${g.id}].items[id=${s.id}]`;
                const open = isOpen(path);
                return (
                  <span key={s.id} className="flex items-center gap-1" style={{ padding: "4px 8px", borderRadius: 999, border: `1px solid ${open ? WARN_LINE : "var(--color-border)"}`, background: open ? WARN_BG : "transparent", fontSize: 13 }}>
                    <input
                      value={s.name}
                      size={Math.max(3, s.name.length)}
                      onChange={(e) => update((d) => (d.skills.find((x) => x.id === g.id)!.items.find((x) => x.id === s.id)!.name = e.target.value), path)}
                      style={{ border: 0, background: "transparent", color: "inherit", font: "inherit" }}
                    />
                    {open && <button type="button" title={flags[path]?.reason} onClick={() => setMarked((m) => new Set(m).add(path))} style={{ ...smallButton, padding: "0 6px" }}>✓</button>}
                    <button type="button" aria-label="Remove skill" onClick={() => update((d) => { const grp = d.skills.find((x) => x.id === g.id)!; grp.items = grp.items.filter((x) => x.id !== s.id); })} style={{ border: 0, background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>×</button>
                  </span>
                );
              })}
              <button type="button" style={smallButton} onClick={() => update((d) => d.skills.find((x) => x.id === g.id)!.items.push({ id: alloc.take("skill"), name: "" }))}>+ Add</button>
            </div>
          </div>
        ))}
      </section>

      {(resume.projects.length > 0 || resume.certifications.length > 0) && (
        <section style={card}>
          <SectionTitle title="Projects and certifications" open={openInSection("projects") + openInSection("certifications")} />
          {resume.projects.map((pr) => {
            const at = `projects[id=${pr.id}]`;
            const ix = (d: Resume) => d.projects.find((x) => x.id === pr.id)!;
            return (
              <Item key={pr.id} title={pr.name || "Project"} open={openInSection(at)} onRemove={() => update((d) => (d.projects = d.projects.filter((x) => x.id !== pr.id)))}>
                {field(`${at}.name`, "Name", pr.name, (d, v) => (ix(d).name = v))}
                <Bullets
                  bullets={pr.bullets}
                  pathFor={(id) => `${at}.bullets[id=${id}]`}
                  field={field}
                  set={(d, id, v) => (ix(d).bullets.find((b) => b.id === id)!.text = v)}
                  onAdd={() => update((d) => ix(d).bullets.push({ id: alloc.take("bullet"), text: "" }))}
                  onRemove={(id) => update((d) => (ix(d).bullets = ix(d).bullets.filter((b) => b.id !== id)))}
                />
              </Item>
            );
          })}
          {resume.certifications.map((c) => {
            const at = `certifications[id=${c.id}]`;
            const ix = (d: Resume) => d.certifications.find((x) => x.id === c.id)!;
            return (
              <Item key={c.id} title={c.name || "Certification"} open={openInSection(at)} onRemove={() => update((d) => (d.certifications = d.certifications.filter((x) => x.id !== c.id)))}>
                <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
                  {field(`${at}.name`, "Name", c.name, (d, v) => (ix(d).name = v))}
                  {field(`${at}.issuer`, "Issuer", c.issuer, (d, v) => (ix(d).issuer = v))}
                </div>
              </Item>
            );
          })}
        </section>
      )}

      <div
        className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3"
        style={{ ...card, flexDirection: "row", paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))" }}
      >
        <span style={{ fontSize: 14, color: saveError ? "var(--color-error, #B42318)" : "var(--color-text-secondary)" }}>
          {saveError ??
            [
              dirty ? "Unsaved changes" : savedAt ? `Saved at ${savedAt.toLocaleTimeString()}` : "No changes yet",
              openLow.length ? `${openLow.length} field${openLow.length === 1 ? "" : "s"} still to check` : "All fields checked",
            ].join(" · ")}
        </span>
        <div className="flex gap-2">
          <button type="button" disabled={saving || !dirty && marked.size === 0} onClick={save} style={{ ...styles.oauthButton, padding: "0 18px" }}>
            Save
          </button>
          <button
            type="button"
            disabled={saving || openLow.length > 0}
            title={openLow.length ? "Check every highlighted field first" : undefined}
            onClick={continueToJd}
            style={{ ...styles.primaryButton, padding: "0 18px", opacity: openLow.length ? 0.5 : 1 }}
          >
            Continue to job description
          </button>
        </div>
      </div>
    </Shell>
  );
}

/** "Jan 2021" → { value: "2021-01", raw }. Unknown formats keep raw only. */
function parseDate(raw: string): { value: string | null; raw: string } {
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const m = /^\s*([a-z]{3})[a-z]*\.?\s+'?(\d{4})\s*$/i.exec(raw);
  if (m) {
    const mi = months.indexOf(m[1]!.toLowerCase());
    if (mi >= 0) return { value: `${m[2]}-${String(mi + 1).padStart(2, "0")}`, raw };
  }
  const ym = /^\s*(\d{4})-(0[1-9]|1[0-2])\s*$/.exec(raw);
  if (ym) return { value: `${ym[1]}-${ym[2]}`, raw };
  const y = /^\s*((?:19|20)\d{2})\s*$/.exec(raw);
  if (y) return { value: y[1]!, raw };
  return { value: null, raw };
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <main style={{ background: "var(--color-background)", minHeight: "100vh" }} className="px-4 py-8 sm:px-8">
      <div className="mx-auto flex w-full max-w-[900px] flex-col gap-5">{children}</div>
    </main>
  );
}

function SectionTitle({ title, open = 0, action }: { title: string; open?: number; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 style={{ margin: 0, fontSize: 18 }}>
        {title}
        {open > 0 && <span style={{ marginLeft: 8, fontSize: 13, color: WARN, fontWeight: 600 }}>{open} to check</span>}
      </h2>
      {action}
    </div>
  );
}

function Item({ title, open, onRemove, children }: { title: string; open: number; onRemove: () => void; children: ReactNode }) {
  const [expanded, setExpanded] = useState(open > 0);
  return (
    <div style={{ border: `1px solid ${open ? WARN_LINE : "var(--color-border)"}`, borderRadius: 8, padding: 14 }} className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <strong>
          {title}
          {open > 0 && <span style={{ marginLeft: 8, fontSize: 13, color: WARN }}>{open} to check</span>}
        </strong>
        <div className="flex gap-2">
          <button type="button" style={smallButton} onClick={() => setExpanded((e) => !e)}>{expanded ? "Collapse" : "Expand"}</button>
          <button type="button" style={smallButton} onClick={onRemove}>Remove</button>
        </div>
      </div>
      {expanded && children}
    </div>
  );
}

type FieldFn = (path: string, label: string, value: string, set: (d: Resume, v: string) => void, opts?: { multiline?: boolean }) => ReactNode;

function Bullets({
  bullets,
  pathFor,
  field,
  set,
  onAdd,
  onRemove,
}: {
  bullets: { id: string; text: string }[];
  pathFor: (id: string) => string;
  field: FieldFn;
  set: (d: Resume, id: string, v: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span style={{ fontSize: 14, fontWeight: 600 }}>Bullets</span>
      {bullets.map((b, i) => (
        <div key={b.id} className="flex items-start gap-2">
          <div className="flex-1">{field(pathFor(b.id), `Bullet ${i + 1}`, b.text, (d, v) => set(d, b.id, v), { multiline: true })}</div>
          <button type="button" aria-label="Remove bullet" style={{ ...smallButton, marginTop: 24 }} onClick={() => onRemove(b.id)}>×</button>
        </div>
      ))}
      <button type="button" style={{ ...smallButton, alignSelf: "flex-start" }} onClick={onAdd}>+ Add bullet</button>
    </div>
  );
}

function Field({
  label,
  value,
  multiline,
  flag,
  onChange,
  onConfirm,
}: {
  label: string;
  value: string;
  multiline?: boolean;
  flag?: ExtractionMeta[string];
  onChange: (v: string) => void;
  onConfirm: () => void;
}) {
  const inputStyle: CSSProperties = {
    ...styles.input,
    width: "100%",
    ...(multiline ? { height: "auto", minHeight: 70, padding: 10, resize: "vertical" } : {}),
    ...(flag ? { borderColor: WARN_LINE, background: WARN_BG } : {}),
  };
  return (
    <label style={styles.label}>
      <span className="flex items-center justify-between gap-2">
        {label}
        {flag && <span style={{ color: WARN, fontWeight: 500, fontSize: 12 }}>{flag.confidence === "low" ? "Check this" : "Worth a look"}</span>}
      </span>
      {multiline ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
      )}
      {flag && (
        <span className="flex flex-wrap items-center justify-between gap-2" style={{ fontSize: 12, fontWeight: 400, color: WARN }}>
          <span>
            {flag.reason}
            {flag.source?.line && <em style={{ display: "block", color: "var(--color-text-secondary)" }}>Read as: “{flag.source.line}”</em>}
          </span>
          <button type="button" style={smallButton} onClick={(e) => { e.preventDefault(); onConfirm(); }}>Looks right</button>
        </span>
      )}
    </label>
  );
}
