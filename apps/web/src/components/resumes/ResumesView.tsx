"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { FileTile } from "@/components/app/FileTile";
import { ButtonLink, Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Select } from "@/components/ui/Field";
import { SearchField } from "@/components/ui/SearchField";
import { Segmented } from "@/components/ui/Segmented";
import { formatTag, isResumeInProgress } from "@/lib/domain";
import { fmtDate } from "@/lib/format";
import { appRoutes, routes } from "@/lib/routes";
import { trpc, trpcErrorMessage } from "@/lib/trpc-client";
import type { ResumeListItem, VersionListItem } from "./types";
import { VersionTable } from "./VersionTable";

type Filter = "all" | "outdated" | "unscored";
type Sort = "updated" | "score" | "company";

const POLL_MS = 4000;

interface ResumesViewProps {
  resumes: ResumeListItem[];
  versions: VersionListItem[];
  initialQuery: string;
}

/** Search / filter / sort + live extraction status for /resumes. */
export function ResumesView({ resumes, versions, initialQuery }: ResumesViewProps) {
  const router = useRouter();
  const [q, setQ] = useState(initialQuery);
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("updated");
  const [retrying, setRetrying] = useState<string | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);

  // While anything is extracting, re-fetch the server list periodically.
  const anyInProgress = resumes.some((r) => isResumeInProgress(r.status));
  useEffect(() => {
    if (!anyInProgress) return;
    const id = window.setInterval(() => router.refresh(), POLL_MS);
    return () => window.clearInterval(id);
  }, [anyInProgress, router]);

  const counts = {
    all: versions.length,
    outdated: versions.filter((v) => v.scoreOutdated).length,
    unscored: versions.filter((v) => v.score === null).length,
  };

  const visibleVersions = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = versions.filter(
      (v) =>
        (filter === "all" || (filter === "outdated" ? v.scoreOutdated : v.score === null)) &&
        (!term || `${v.company} ${v.role}`.toLowerCase().includes(term)),
    );
    return [...list].sort((a, b) =>
      sort === "company"
        ? a.company.localeCompare(b.company)
        : sort === "score"
          ? (b.score ?? -1) - (a.score ?? -1)
          : +new Date(b.updatedAt) - +new Date(a.updatedAt),
    );
  }, [versions, q, filter, sort]);

  const term = q.trim().toLowerCase();
  const originals = resumes.filter(
    (r) =>
      r.status === "ready" &&
      (!term || r.fileName.toLowerCase().includes(term) || visibleVersions.some((v) => v.resumeId === r.id)),
  );
  const pending = resumes.filter((r) => r.status !== "ready");

  async function retry(resumeId: string) {
    setRetrying(resumeId);
    setRetryError(null);
    try {
      await trpc.resumes.retryExtraction.mutate({ resumeId });
      router.refresh();
    } catch (err) {
      setRetryError(trpcErrorMessage(err));
    } finally {
      setRetrying(null);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <SearchField
          label="Search versions"
          placeholder="Search by company or role"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="flex-[1_1_260px]"
        />
        <Segmented<Filter>
          label="Filter"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: `All · ${counts.all}` },
            { value: "outdated", label: `Outdated score · ${counts.outdated}` },
            { value: "unscored", label: `Not scored · ${counts.unscored}` },
          ]}
        />
        <label className="flex items-center gap-2 text-sm text-text-2">
          Sort
          <Select fieldSize="sm" value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="w-auto bg-surface font-medium">
            <option value="updated">Last updated</option>
            <option value="score">ATS score</option>
            <option value="company">Company</option>
          </Select>
        </label>
      </div>

      {resumes.length === 0 ? (
        <section className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-border-strong bg-surface p-6">
          <strong className="font-display text-[17px]">No resumes yet</strong>
          <span className="text-sm text-text-2">Upload your resume once, then tailor a version for every job.</span>
          <ButtonLink href={routes.upload} size="sm" className="h-10 text-sm">
            Upload resume
          </ButtonLink>
        </section>
      ) : null}

      {originals.map((r) => {
        const own = visibleVersions.filter((v) => v.resumeId === r.id);
        const total = versions.filter((v) => v.resumeId === r.id).length;
        return (
          <section key={r.id} className="overflow-hidden rounded-xl border border-border bg-surface">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface-2 px-5 py-[18px]">
              <div className="flex min-w-0 items-center gap-3">
                <FileTile label={formatTag(r.fileFormat)} />
                <div className="flex min-w-0 flex-col gap-[3px]">
                  <strong className="truncate font-display text-[17px]">{r.fileName} · Original</strong>
                  <span className="text-[13px] text-text-2">
                    uploaded {fmtDate(r.createdAt)} · {total} tailored version{total === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <ButtonLink href={appRoutes.review(r.id)} variant="outline" className="h-9 border-border-strong px-3.5 text-[13px]">
                  Edit original
                </ButtonLink>
                <ButtonLink href={`${routes.generate}?resume=${r.id}`} className="h-9 px-3.5 text-[13px]">
                  New version
                </ButtonLink>
              </div>
            </div>
            <VersionTable versions={own} />
          </section>
        );
      })}

      {retryError ? (
        <p role="alert" className="m-0 text-sm text-crit">
          {retryError}
        </p>
      ) : null}
      {pending.map((r) =>
        r.status === "failed" ? (
          <section
            key={r.id}
            role="alert"
            className="flex flex-wrap items-center gap-3.5 rounded-xl border border-crit-line bg-crit-bg px-5 py-[18px]"
          >
            <FileTile label={formatTag(r.fileFormat)} />
            <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1">
              <strong className="text-sm">{r.fileName}</strong>
              <span className="text-[13px] font-medium text-crit">
                {r.extractionError ?? "We couldn’t read this file. Try again, or upload a different copy."}
              </span>
            </div>
            <Button variant="outline" className="h-[34px] border-border-strong bg-surface px-3 text-[13px]" disabled={retrying === r.id} onClick={() => retry(r.id)}>
              {retrying === r.id ? "Retrying…" : "Retry"}
            </Button>
          </section>
        ) : (
          <section
            key={r.id}
            aria-busy="true"
            className="flex flex-wrap items-center gap-3.5 rounded-xl border border-dashed border-border-strong bg-surface px-5 py-[18px]"
          >
            <FileTile label={formatTag(r.fileFormat)} tone="muted" />
            <div className="flex flex-[1_1_260px] flex-col gap-2">
              <div className="flex justify-between gap-2 text-sm">
                <strong className="truncate">{r.fileName}</strong>
                <Chip tone="info" pill className="px-[9px] py-[3px] text-xs font-semibold">
                  {r.status === "structuring" ? "Organising sections" : "Extracting"}
                </Chip>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div className="h-1.5 w-1/3 animate-[rp-indeterminate_1.4s_ease-in-out_infinite] rounded-full bg-link" />
              </div>
            </div>
          </section>
        ),
      )}
    </>
  );
}
