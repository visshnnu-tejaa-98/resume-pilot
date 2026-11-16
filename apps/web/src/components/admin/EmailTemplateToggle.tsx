"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Switch } from "@/components/ui/Switch";
import { trpc, trpcErrorMessage } from "@/lib/trpc-client";
import { ReasonDialog } from "./ReasonDialog";

/** On/off switch for a marketing email, audited with a reason. */
export function EmailTemplateToggle({ templateKey, name, enabled }: { templateKey: string; name: string; enabled: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Switch checked={enabled} label={`${enabled ? "Disable" : "Enable"} ${name}`} onChange={() => setOpen(true)} />
      <ReasonDialog
        open={open}
        onClose={() => setOpen(false)}
        title={`${enabled ? "Turn off" : "Turn on"} “${name}”?`}
        subtitle={enabled ? "No new sends of this email until it's turned back on." : "Sends resume for users who haven't opted out."}
        confirmLabel={enabled ? "Turn off" : "Turn on"}
        onConfirm={async (reason) => {
          try {
            await trpc.admin.content.setEmailTemplateEnabled.mutate({ templateKey, enabled: !enabled, reason });
            router.refresh();
          } catch (err) {
            throw new Error(trpcErrorMessage(err), { cause: err });
          }
        }}
      />
    </>
  );
}
