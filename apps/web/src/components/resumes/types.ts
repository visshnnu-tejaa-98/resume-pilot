import type { ResumeStatus } from "@/lib/domain";

/** An uploaded original, as returned by listResumes(). */
export interface ResumeListItem {
  id: string;
  fileName: string;
  fileFormat: string;
  status: ResumeStatus;
  extractionError: string | null;
  createdAt: Date;
}

/**
 * A tailored version under its original (resume_versions, kind=generated).
 * Score fields fill in once ATS scoring (m7) runs.
 */
export interface VersionListItem {
  id: string;
  resumeId: string;
  company: string;
  role: string;
  score: number | null;
  scoreOutdated: boolean;
  template: string;
  updatedAt: Date;
  createdAt: Date;
  /** Compare needs a job and a source version (prd.md §9.4). */
  jdId: string | null;
  parentVersionId: string | null;
}
