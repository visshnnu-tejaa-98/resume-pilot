"use client";

import { useState } from "react";
import { ScoreButton } from "@/components/ats/ScoreRunner";
import { TextLink } from "@/components/ui/Button";
import { Select } from "@/components/ui/Field";
import { routes } from "@/lib/routes";

/** No report yet for this version: pick a job and score it. */
export function ScoreEmpty({ versionId, jobs, initialJd }: { versionId: string; jobs: { id: string; name: string }[]; initialJd: string | null }) {
  const [jd, setJd] = useState(initialJd ?? jobs[0]?.id ?? "");
  return (
    <section className="flex flex-col gap-4 rounded-[14px] border border-border bg-surface p-7">
      <h2 className="m-0 font-display text-[19px] font-bold">Score this resume</h2>
      <p className="m-0 text-sm leading-[1.6] text-text-2">
        Pick a job. We check keywords, skills, experience, education and formatting, and show what each point is based on.
      </p>
      {jobs.length ? (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-[1_1_280px] flex-col gap-1.5 text-[13px] font-semibold">
            Job
            <Select fieldSize="sm" value={jd} onChange={(e) => setJd(e.target.value)}>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.name}
                </option>
              ))}
            </Select>
          </label>
          <ScoreButton versionId={versionId} jdId={jd || null} label="See estimate" className="h-10 px-5 text-sm" />
        </div>
      ) : (
        <span className="text-sm">
          Add a job description first. <TextLink href={routes.jobs}>Go to jobs</TextLink>
        </span>
      )}
    </section>
  );
}
