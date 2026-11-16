"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { TEMPLATE_STYLES } from "@/components/resume/ResumeDocument";
import { Switch } from "@/components/ui/Switch";
import { cn } from "@/lib/cn";
import { trpc, trpcErrorMessage } from "@/lib/trpc-client";
import type { TemplateName } from "@/stores/preferences-store";
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
  const style = TEMPLATE_STYLES[t.name as TemplateName];

  return (
    <article className={cn("flex flex-col gap-3 rounded-xl border border-border bg-surface p-4", !t.active && "opacity-60")}>
      <div aria-hidden="true" className="flex aspect-[210/297] flex-col gap-1.5 overflow-hidden rounded bg-white p-4 shadow-sm" style={{ textAlign: style?.align ?? "left" }}>
        <span style={{ fontFamily: style?.head, color: style?.nameColor }} className="text-sm font-bold">
          Asha Rao
        </span>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col gap-1">
            <span className="mt-1 h-1.5 w-1/3 rounded-sm" style={{ background: style?.headColor ?? "#555", borderBottom: style?.rule }} />
            <span className="h-1 w-full rounded-sm bg-[#E3E7EC]" />
            <span className="h-1 w-5/6 rounded-sm bg-[#E3E7EC]" />
          </div>
        ))}
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
