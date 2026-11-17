"use client";

import type { Resume } from "@resume-pilot/validators/resume";
import { useState } from "react";
import { ResumeDocument } from "@/components/resume/ResumeDocument";
import { Dialog } from "@/components/ui/Dialog";
import { trpc, trpcErrorMessage } from "@/lib/trpc-client";
import { ReasonDialog } from "./ReasonDialog";

/**
 * Logged admin access to a resume (prd.md §12.2, §14.2): asks for a
 * reason, the server writes the audit row, then the content is shown.
 * Nothing is cached; every view is a new logged access.
 */
export function ViewResumeButton({ userId, versionId, label }: { userId: string; versionId: string; label: string }) {
  const [ask, setAsk] = useState(false);
  const [content, setContent] = useState<Resume | null>(null);
  return (
    <>
      <button type="button" className="text-[13px] font-semibold text-link" onClick={() => setAsk(true)}>
        View content
      </button>
      <ReasonDialog
        open={ask}
        onClose={() => setAsk(false)}
        title="View resume content?"
        subtitle={`${label}. This access is written to the audit log under your name.`}
        confirmLabel="View"
        onConfirm={async (reason) => {
          try {
            const r = await trpc.admin.users.viewResumeContent.mutate({ userId, versionId, reason });
            setContent(r.content);
          } catch (err) {
            throw new Error(trpcErrorMessage(err), { cause: err });
          }
        }}
      />
      <Dialog open={!!content} onClose={() => setContent(null)} title={label} width={880}>
        <div className="max-h-[70vh] overflow-auto">{content ? <ResumeDocument resume={content} template="Classic" className="max-w-full" /> : null}</div>
      </Dialog>
    </>
  );
}
