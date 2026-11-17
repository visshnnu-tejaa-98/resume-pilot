"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { trpc, trpcErrorMessage } from "@/lib/trpc-client";
import { ReasonDialog } from "./ReasonDialog";

/** Cancels a draft/scheduled campaign before it starts (prd.md §13.4), with an audited reason. */
export function CancelCampaignButton({ campaignId, subject }: { campaignId: string; subject: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="text-sm font-semibold text-crit" onClick={() => setOpen(true)}>
        Cancel
      </button>
      <ReasonDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Cancel this campaign?"
        subtitle={`“${subject}” won't be sent.`}
        confirmLabel="Cancel campaign"
        danger
        onConfirm={async (reason) => {
          try {
            await trpc.admin.emails.cancelCampaign.mutate({ campaignId, reason });
            router.refresh();
          } catch (err) {
            throw new Error(trpcErrorMessage(err), { cause: err });
          }
        }}
      />
    </>
  );
}
