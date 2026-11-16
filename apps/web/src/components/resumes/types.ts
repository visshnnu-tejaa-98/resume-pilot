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
 * A tailored version under an original. Generation (tasks/todo/m6) and
 * scoring (m7) aren't built yet, so pages pass an empty list for now;
 * the UI is ready for these rows.
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
}
