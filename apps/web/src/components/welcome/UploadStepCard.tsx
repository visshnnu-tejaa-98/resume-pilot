"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { TextLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dropzone } from "@/components/upload/Dropzone";
import { useResumeUpload } from "@/components/upload/useResumeUpload";
import { routes } from "@/lib/routes";

/** Welcome step 2: upload the first resume, then hand off to the dashboard. */
export function UploadStepCard() {
  const router = useRouter();
  const onDone = useCallback(() => router.push(routes.dashboard), [router]);
  const { upload, busy, error } = useResumeUpload(onDone);

  return (
    <Card radius="lg" className="flex flex-col gap-[18px] p-7 max-sm:p-5">
      <div className="flex items-center gap-3">
        <span className="flex size-8 items-center justify-center rounded-full bg-accent font-mono text-[13px] font-semibold text-on-accent">
          2
        </span>
        <strong className="font-display text-xl">Upload your resume</strong>
      </div>
      <Dropzone
        tone="bg"
        onFiles={upload}
        busy={busy}
        busyLabel="Uploading your resume…"
        caption="PDF, DOCX, LaTeX (.tex), PNG or JPG · up to 10 MB · free"
      />
      {error ? (
        <p role="alert" className="m-0 text-sm text-crit">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TextLink href={routes.dashboard} className="text-[15px] underline">
          Skip to dashboard
        </TextLink>
        <span className="text-[13px] text-text-2">Uploading and extraction never use credits.</span>
      </div>
    </Card>
  );
}
