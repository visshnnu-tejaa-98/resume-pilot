"use client";

import type { ExtractionMeta, Resume } from "@resume-pilot/validators/resume";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FlowSteps } from "@/components/app/FlowSteps";
import { PageHeader } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { cn } from "@/lib/cn";
import { fmtTime } from "@/lib/format";
import { routes } from "@/lib/routes";
import { trpc, trpcErrorMessage } from "@/lib/trpc-client";
import { useOpenLow, useReviewStore } from "@/stores/review-store";
import { BulletList, DashedButton, EntryCard, Grip, ReviewField, SectionCard, SmallButton } from "./parts";

/** "Jan 2021" / "2021-01" / "2021" → { value, raw }. Unknown formats keep raw only. */
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

const grid = (min: number) => ({ gridTemplateColumns: `repeat(auto-fit, minmax(min(${min}px, 100%), 1fr))` });

/**
 * Edits the original version (design/screens/ResumeReview.dc.html). A
 * flagged field shows its reason; the user fixes it (an edit counts as
 * reviewed, §8.6) or clicks "Looks right". Continue stays disabled while
 * any low-confidence flag is open — the server enforces the same rule
 * (`resumes.readiness`).
 */
export function ReviewEditor({ resumeId, fileName }: { resumeId: string; fileName: string }) {
  const router = useRouter();
  const resume = useReviewStore((s) => (s.resumeId === resumeId ? s.resume : null));
  const alloc = useReviewStore((s) => s.alloc);
  const dirty = useReviewStore((s) => s.dirty);
  const marked = useReviewStore((s) => s.marked);
  const savedAt = useReviewStore((s) => s.savedAt);
  const { load, update, saved, reset } = useReviewStore.getState();
  const openLow = useOpenLow();

  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState("personal");

  useEffect(() => {
    let alive = true;
    trpc.resumes.original
      .query({ resumeId })
      .then((v) => alive && load(resumeId, v.content as Resume, (v.extractionMeta ?? {}) as ExtractionMeta))
      .catch(() => alive && setLoadError("We couldn't load this resume. It may still be processing."));
    return () => {
      alive = false;
      reset();
    };
  }, [resumeId, load, reset]);

  // Warn before leaving with unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const openIn = (prefix: string) => openLow.filter((p) => p.startsWith(prefix)).length;

  async function save(): Promise<boolean> {
    const { resume: current, marked: reviewed } = useReviewStore.getState();
    if (!current) return false;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await trpc.resumes.saveReview.mutate({ resumeId, content: current, reviewedPaths: [...reviewed] });
      saved(res.extractionMeta as ExtractionMeta);
      return true;
    } catch (err) {
      setSaveError(trpcErrorMessage(err, "Couldn't save. Please try again."));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function continueToJd() {
    if (!(await save())) return;
    try {
      const r = await trpc.resumes.readiness.query({ resumeId });
      if (r.ready) router.push(`${routes.jobNew}?resumeId=${resumeId}`);
      else setSaveError(`${r.unreviewed.length} field${r.unreviewed.length === 1 ? "" : "s"} still need a check.`);
    } catch (err) {
      setSaveError(trpcErrorMessage(err));
    }
  }

  const header = (
    <PageHeader
      crumbs={[{ href: routes.resumes, label: "My resumes" }]}
      title="Review your resume"
      subtitle="This is your original. Fix anything we read wrong; tailored versions are built from it."
      actions={
        openLow.length > 0 ? (
          <Chip tone="warn" pill className="px-3 py-1.5 font-semibold">
            {openLow.length} field{openLow.length === 1 ? "" : "s"} to check
          </Chip>
        ) : resume ? (
          <Chip tone="good" pill className="px-3 py-1.5 font-semibold">
            All fields checked
          </Chip>
        ) : undefined
      }
    />
  );

  if (loadError || !resume || !alloc) {
    return (
      <>
        <FlowSteps current={1} />
        {header}
        <div className="rounded-xl border border-border bg-surface p-6 text-sm text-text-2" aria-busy={!loadError}>
          {loadError ?? "Loading your resume…"}
        </div>
      </>
    );
  }

  const p = resume.personalInfo;
  const sections = [
    { id: "personal", label: "Personal info", count: 6, open: openIn("personalInfo") },
    { id: "summary", label: "Summary", count: resume.summary.text ? 1 : 0, open: openIn("summary") },
    { id: "work", label: "Work experience", count: resume.workExperience.length, open: openIn("workExperience") },
    { id: "skills", label: "Skills", count: resume.skills.reduce((n, g) => n + g.items.length, 0), open: openIn("skills") },
    { id: "education", label: "Education", count: resume.education.length, open: openIn("education") },
    {
      id: "projects",
      label: "Projects and certs",
      count: resume.projects.length + resume.certifications.length,
      open: openIn("projects") + openIn("certifications"),
    },
  ];

  return (
    <>
      <FlowSteps current={1} />
      {header}
      <div className="flex flex-wrap items-start gap-6">
        <nav
          aria-label="Sections"
          className="flex flex-[1_1_200px] flex-col gap-0.5 rounded-xl border border-border bg-surface p-2.5 md:sticky md:top-24"
        >
          {sections.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              onClick={() => setActiveSection(s.id)}
              aria-current={activeSection === s.id ? "location" : undefined}
              className={cn(
                "flex h-[38px] items-center justify-between gap-2 rounded-md px-2.5 text-sm text-text no-underline hover:bg-surface-2",
                activeSection === s.id && "bg-surface-2",
              )}
            >
              <span className="flex items-center gap-2">
                <Grip />
                {s.label}
              </span>
              <span className={cn("text-xs font-semibold", s.open ? "text-warn" : "text-text-2")}>
                {s.open ? `${s.open} to check` : s.count}
              </span>
            </a>
          ))}
          <span className="px-2.5 pt-1.5 pb-1 text-xs text-text-2">
            You&apos;re responsible for the accuracy of anything you add manually.
          </span>
        </nav>

        <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-[18px]">
          <SectionCard id="personal" title="Personal information" open={openIn("personalInfo")}>
            <div className="grid gap-3.5" style={grid(220)}>
              <ReviewField path="personalInfo.firstName" label="First name" value={p.firstName} set={(d, v) => (d.personalInfo.firstName = v)} />
              <ReviewField path="personalInfo.lastName" label="Last name" value={p.lastName} set={(d, v) => (d.personalInfo.lastName = v)} />
              <ReviewField path="personalInfo.email" label="Email" value={p.email} set={(d, v) => (d.personalInfo.email = v)} />
              <ReviewField path="personalInfo.phone" label="Phone" value={p.phone} set={(d, v) => (d.personalInfo.phone = v)} />
              <ReviewField path="personalInfo.location" label="Location" value={p.location} set={(d, v) => (d.personalInfo.location = v)} />
              <ReviewField path="personalInfo.headline" label="Headline" value={p.headline} set={(d, v) => (d.personalInfo.headline = v)} />
            </div>
          </SectionCard>

          <SectionCard id="summary" title="Professional summary" open={openIn("summary")}>
            <ReviewField path="summary.text" label="Professional summary" hideLabel multiline value={resume.summary.text} set={(d, v) => (d.summary.text = v)} />
          </SectionCard>

          <SectionCard
            id="work"
            title="Work experience"
            open={openIn("workExperience")}
            action={
              <SmallButton
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
              </SmallButton>
            }
          >
            {resume.workExperience.length === 0 ? <p className="m-0 text-sm text-text-2">No roles found. Add one if you have work experience.</p> : null}
            {resume.workExperience.map((w) => {
              const at = `workExperience[id=${w.id}]`;
              const ix = (d: Resume) => d.workExperience.find((x) => x.id === w.id)!;
              return (
                <EntryCard
                  key={w.id}
                  title={[w.company, w.designation].filter(Boolean).join(" · ") || "New role"}
                  summary={`${w.startDate.raw || "?"} – ${w.isCurrent ? "Present" : w.endDate.raw || "?"} · ${w.bullets.length} bullet${w.bullets.length === 1 ? "" : "s"}`}
                  open={openIn(at)}
                  onRemove={() => update((d) => (d.workExperience = d.workExperience.filter((x) => x.id !== w.id)))}
                >
                  <div className="grid gap-3" style={grid(160)}>
                    <ReviewField path={`${at}.company`} label="Company" value={w.company} set={(d, v) => (ix(d).company = v)} />
                    <ReviewField path={`${at}.designation`} label="Designation" value={w.designation} set={(d, v) => (ix(d).designation = v)} />
                    <ReviewField path={`${at}.location`} label="Location" value={w.location} set={(d, v) => (ix(d).location = v)} />
                    <ReviewField path={`${at}.startDate`} label="Start" value={w.startDate.raw} set={(d, v) => (ix(d).startDate = parseDate(v))} />
                    {!w.isCurrent ? (
                      <ReviewField path={`${at}.endDate`} label="End" value={w.endDate.raw} set={(d, v) => (ix(d).endDate = parseDate(v))} />
                    ) : null}
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4 accent-link"
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
                  <BulletList
                    bullets={w.bullets}
                    pathFor={(id) => `${at}.bullets[id=${id}]`}
                    set={(d, id, v) => (ix(d).bullets.find((b) => b.id === id)!.text = v)}
                    onAdd={() => update((d) => ix(d).bullets.push({ id: alloc.take("bullet"), text: "", kind: "responsibility" }))}
                    onRemove={(id) => update((d) => (ix(d).bullets = ix(d).bullets.filter((b) => b.id !== id)))}
                  />
                </EntryCard>
              );
            })}
          </SectionCard>

          <SectionCard id="skills" title="Skills" open={openIn("skills")}>
            {resume.skills.map((g) => (
              <div key={g.id} className="flex flex-col gap-2">
                <span className="text-[13px] font-semibold text-text-2">{g.category}</span>
                <div className="flex flex-wrap gap-2">
                  {g.items.map((s) => (
                    <SkillChip key={s.id} groupId={g.id} skill={s} />
                  ))}
                  <DashedButton onClick={() => update((d) => d.skills.find((x) => x.id === g.id)!.items.push({ id: alloc.take("skill"), name: "" }))}>
                    + Add
                  </DashedButton>
                </div>
              </div>
            ))}
          </SectionCard>

          <SectionCard id="education" title="Education" open={openIn("education")}>
            {resume.education.length === 0 ? <p className="m-0 text-sm text-text-2">No education found.</p> : null}
            {resume.education.map((e) => {
              const at = `education[id=${e.id}]`;
              const ix = (d: Resume) => d.education.find((x) => x.id === e.id)!;
              return (
                <EntryCard
                  key={e.id}
                  title={[e.degree, e.institution].filter(Boolean).join(" · ") || "Education"}
                  summary={[e.fieldOfStudy, e.endDate.raw].filter(Boolean).join(" · ")}
                  open={openIn(at)}
                  onRemove={() => update((d) => (d.education = d.education.filter((x) => x.id !== e.id)))}
                >
                  <div className="grid gap-3" style={grid(200)}>
                    <ReviewField path={`${at}.institution`} label="Institution" value={e.institution} set={(d, v) => (ix(d).institution = v)} />
                    <ReviewField path={`${at}.degree`} label="Degree" value={e.degree} set={(d, v) => (ix(d).degree = v)} />
                    <ReviewField path={`${at}.fieldOfStudy`} label="Field of study" value={e.fieldOfStudy} set={(d, v) => (ix(d).fieldOfStudy = v)} />
                    <ReviewField path={`${at}.grade`} label="Grade" value={e.grade.value} set={(d, v) => (ix(d).grade.value = v)} />
                    <ReviewField path={`${at}.startDate`} label="Start" value={e.startDate.raw} set={(d, v) => (ix(d).startDate = parseDate(v))} />
                    <ReviewField path={`${at}.endDate`} label="End" value={e.endDate.raw} set={(d, v) => (ix(d).endDate = parseDate(v))} />
                  </div>
                </EntryCard>
              );
            })}
          </SectionCard>

          <SectionCard id="projects" title="Projects and certifications" open={openIn("projects") + openIn("certifications")}>
            {resume.projects.length + resume.certifications.length === 0 ? <p className="m-0 text-sm text-text-2">None found.</p> : null}
            {resume.projects.map((pr) => {
              const at = `projects[id=${pr.id}]`;
              const ix = (d: Resume) => d.projects.find((x) => x.id === pr.id)!;
              return (
                <EntryCard
                  key={pr.id}
                  title={pr.name || "Project"}
                  summary={`Project · ${pr.bullets.length} bullet${pr.bullets.length === 1 ? "" : "s"}`}
                  open={openIn(at)}
                  onRemove={() => update((d) => (d.projects = d.projects.filter((x) => x.id !== pr.id)))}
                >
                  <ReviewField path={`${at}.name`} label="Name" value={pr.name} set={(d, v) => (ix(d).name = v)} />
                  <BulletList
                    bullets={pr.bullets}
                    pathFor={(id) => `${at}.bullets[id=${id}]`}
                    set={(d, id, v) => (ix(d).bullets.find((b) => b.id === id)!.text = v)}
                    onAdd={() => update((d) => ix(d).bullets.push({ id: alloc.take("bullet"), text: "" }))}
                    onRemove={(id) => update((d) => (ix(d).bullets = ix(d).bullets.filter((b) => b.id !== id)))}
                  />
                </EntryCard>
              );
            })}
            {resume.certifications.map((c) => {
              const at = `certifications[id=${c.id}]`;
              const ix = (d: Resume) => d.certifications.find((x) => x.id === c.id)!;
              return (
                <EntryCard
                  key={c.id}
                  title={c.name || "Certification"}
                  summary={["Certification", c.issuer].filter(Boolean).join(" · ")}
                  open={openIn(at)}
                  onRemove={() => update((d) => (d.certifications = d.certifications.filter((x) => x.id !== c.id)))}
                >
                  <div className="grid gap-3" style={grid(200)}>
                    <ReviewField path={`${at}.name`} label="Name" value={c.name} set={(d, v) => (ix(d).name = v)} />
                    <ReviewField path={`${at}.issuer`} label="Issuer" value={c.issuer} set={(d, v) => (ix(d).issuer = v)} />
                  </div>
                </EntryCard>
              );
            })}
          </SectionCard>

          <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-hero px-5 py-4 text-on-hero shadow-modal">
            <span role="status" className={cn("text-sm", saveError ? "text-[#FF8A7E]" : "text-on-hero-2")}>
              {saveError ??
                [
                  dirty ? "Unsaved changes" : savedAt ? `Saved at ${fmtTime(savedAt)}` : `Original · ${fileName}`,
                  openLow.length ? `${openLow.length} field${openLow.length === 1 ? "" : "s"} still to check` : "All fields checked",
                ].join(" · ")}
            </span>
            <div className="flex gap-2.5">
              <Button variant="outline-hero" className="h-[42px] px-4 text-sm" disabled={saving || (!dirty && marked.size === 0)} onClick={() => void save()}>
                {saving ? "Saving…" : "Save"}
              </Button>
              <Button
                variant="brand"
                className="h-[42px] px-[18px] text-sm"
                disabled={saving || openLow.length > 0}
                title={openLow.length ? "Check every highlighted field first" : undefined}
                onClick={() => void continueToJd()}
              >
                Continue to job description
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function SkillChip({ groupId, skill }: { groupId: string; skill: { id: string; name: string } }) {
  const path = `skills[id=${groupId}].items[id=${skill.id}]`;
  const update = useReviewStore((s) => s.update);
  const confirm = useReviewStore((s) => s.confirm);
  const flag = useReviewStore((s) => {
    const f = s.flags[path];
    return f && !f.reviewed && !s.marked.has(path) && !s.touched.has(path) ? f : undefined;
  });
  const setName = (v: string) =>
    update((d) => (d.skills.find((x) => x.id === groupId)!.items.find((x) => x.id === skill.id)!.name = v), path);
  const remove = () =>
    update((d) => {
      const g = d.skills.find((x) => x.id === groupId)!;
      g.items = g.items.filter((x) => x.id !== skill.id);
    });
  return (
    <span
      title={flag?.reason}
      className={cn(
        "flex items-center gap-1.5 rounded-md py-1.5 pr-2 pl-2.5 text-[13px]",
        flag ? "border border-warn-line bg-warn-bg" : "bg-surface-2",
      )}
    >
      <input
        aria-label="Skill"
        value={skill.name}
        size={Math.max(3, skill.name.length)}
        onChange={(e) => setName(e.target.value)}
        className="border-0 bg-transparent p-0 text-[13px] text-text outline-none"
      />
      {flag ? (
        <button type="button" aria-label={`Confirm ${skill.name}`} onClick={() => confirm(path)} className="cursor-pointer border-0 bg-transparent text-xs font-semibold text-warn">
          ✓
        </button>
      ) : null}
      <button type="button" aria-label={`Remove ${skill.name || "skill"}`} onClick={remove} className="flex cursor-pointer border-0 bg-transparent p-0 text-text-2 hover:text-crit">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
    </span>
  );
}
