"use client";

import { useCallback, useState } from "react";
import { checkUploadSelection, uploadResume, type UploadResult } from "@/lib/upload";

/** Validate-then-upload state machine shared by Welcome and Upload. */
export function useResumeUpload(onDone: (result: UploadResult) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(
    async (files: File[]) => {
      const problem = checkUploadSelection(files);
      if (problem) {
        setError(problem);
        return;
      }
      setBusy(true);
      setError(null);
      try {
        onDone(await uploadResume(files));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed. Please try again.");
      } finally {
        setBusy(false);
      }
    },
    [onDone],
  );

  return { upload, busy, error };
}
