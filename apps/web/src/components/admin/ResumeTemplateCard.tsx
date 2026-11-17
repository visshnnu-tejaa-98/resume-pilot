"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SAMPLE_RESUME } from "@resume-pilot/resume-templates";
import { ResumeDocument } from "@/components/resume/ResumeDocument";
import { Switch } from "@/components/ui/Switch";
import { cn } from "@/lib/cn";
import { trpc, trpcErrorMessage } from "@/lib/trpc-client";
import { ReasonDialog } from "./ReasonDialog";

export interface ResumeTemplateRow {
  id: string;
  key: string;
  name: string;
  active: boolean;
  used: number;
}

/** One template tile: mini A4 sketch, usage and an audited enable switch. */
export function ResumeTemplateCard({ t }: { t: ResumeTemplateRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <article className={cn("flex flex-col gap-3 rounded-xl border border-border bg-surface p-4", !t.active && "opacity-60")}>
      {/* Real render of the fictional sample, scaled down. */}
      <div aria-hidden="true" className="pointer-events-none aspect-[210/297] overflow-hidden rounded bg-white shadow-sm select-none">
        <ResumeDocument resume={SAMPLE_RESUME} template={t.key} zoom={0.3} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <strong className="font-display text-base">{t.name}</strong>
        <span className="font-mono text-xs text-text-2">{t.key}</span>
      </div>
      <span className="text-xs text-text-2">Used by {t.used.toLocaleString("en-IN")} versions</span>
      <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
        <span>Enabled</span>
        <Switch checked={t.active} label={`${t.active ? "Disable" : "Enable"} ${t.name}`} onChange={() => setOpen(true)} />
      </div>
      <ReasonDialog
        open={open}
        onClose={() => setOpen(false)}
        title={`${t.active ? "Disable" : "Enable"} ${t.name}?`}
        subtitle={t.active ? "Existing versions keep it; it can't be newly picked." : "Users can pick it again."}
        confirmLabel={t.active ? "Disable template" : "Enable template"}
        onConfirm={async (reason) => {
          try {
            await trpc.admin.content.setResumeTemplateActive.mutate({ templateId: t.id, active: !t.active, reason });
            router.refresh();
          } catch (err) {
            throw new Error(trpcErrorMessage(err), { cause: err });
          }
        }}
      />
    </article>
  );
}
