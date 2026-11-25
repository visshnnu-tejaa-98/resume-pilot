"use client";

import { useState } from "react";
import { ScoreButton } from "@/components/ats/ScoreRunner";
import { TextLink } from "@/components/ui/Button";
import { Select } from "@/components/ui/Field";
import { routes } from "@/lib/routes";

interface Props {
  resumes: { id: string; name: string; jdId: string | null; score: number | null }[];
  jobs: { id: string; name: string }[];
  initialVersion?: string;
  initialJd?: string;
}

/** Resume + job pickers in front of the usual estimate → hold → score flow (prd.md §3.4, §9). */
export function AtsScorePicker({ resumes, jobs, initialVersion, initialJd }: Props) {
  const has = <T extends { id: string }>(list: T[], id?: string) => (id && list.some((x) => x.id === id) ? id : undefined);
  const [versionId, setVersionId] = useState(has(resumes, initialVersion) ?? resumes[0]?.id ?? "");
  const own = resumes.find((r) => r.id === versionId)?.jdId ?? undefined;
  const [jd, setJd] = useState(has(jobs, initialJd) ?? has(jobs, own) ?? jobs[0]?.id ?? "");

  if (!resumes.length || !jobs.length) {
    return (
      <section className="flex flex-col gap-2 rounded-[14px] border border-border bg-surface p-7 text-sm">
        {!resumes.length ? (
          <span>
            Upload a resume first. <TextLink href={routes.upload}>Upload resume</TextLink>
          </span>
        ) : null}
        {!jobs.length ? (
          <span>
            Add a job description first. <TextLink href={routes.jobNew}>Add a job</TextLink>
          </span>
        ) : null}
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4 rounded-[14px] border border-border bg-surface p-7">
      <p className="m-0 text-sm leading-[1.6] text-text-2">
        We check keywords, skills, experience, education and formatting, and show what each point is based on. You’ll see the most it can cost before
        anything runs; re-checking content that was already scored against the same job is free.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-[1_1_280px] flex-col gap-1.5 text-[13px] font-semibold">
          Resume
          <Select
            fieldSize="sm"
            value={versionId}
            onChange={(e) => {
              setVersionId(e.target.value);
              const ownJd = resumes.find((r) => r.id === e.target.value)?.jdId;
              if (ownJd && jobs.some((j) => j.id === ownJd)) setJd(ownJd);
            }}
          >
            {resumes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.score != null ? ` · last score ${r.score}` : ""}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-[1_1_280px] flex-col gap-1.5 text-[13px] font-semibold">
          Job description
          <Select fieldSize="sm" value={jd} onChange={(e) => setJd(e.target.value)}>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.name}
              </option>
            ))}
          </Select>
        </label>
        <ScoreButton key={`${versionId}:${jd}`} versionId={versionId} jdId={jd || null} label="Get ATS score" className="h-10 px-5 text-sm" />
      </div>
    </section>
  );
}
