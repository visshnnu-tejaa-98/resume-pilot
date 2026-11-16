"use client";

import { useCallback, useRef, useState } from "react";
import { checkUploadSelection, uploadResume, type UploadResult } from "@/lib/upload";

/** Validate-then-upload state machine shared by Welcome and Upload. */
export function useResumeUpload(onDone: (result: UploadResult, files: File[]) => void) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const upload = useCallback(
    async (files: File[]) => {
      const problem = checkUploadSelection(files);
      if (problem) {
        setError(problem);
        return;
      }
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setBusy(true);
      setProgress(0);
      setError(null);
      try {
        onDone(await uploadResume(files, { onProgress: setProgress, signal: ctrl.signal }), files);
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          setError(err instanceof Error ? err.message : "Upload failed. Please try again.");
        }
      } finally {
        setBusy(false);
        abortRef.current = null;
      }
    },
    [onDone],
  );

  const cancel = useCallback(() => abortRef.current?.abort(), []);

  return { upload, cancel, busy, progress, error, setError };
}
