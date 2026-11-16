"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { cn } from "@/lib/cn";
import { fmtCredits } from "@/lib/format";
import { trpc, trpcErrorMessage } from "@/lib/trpc-client";
import { ReasonDialog } from "./ReasonDialog";

interface UserActionsProps {
  userId: string;
  label: string;
  balance: number;
  status: "active" | "suspended";
  isSelf: boolean;
}

/** Adjust credits + suspend/reinstate — both audited, both via adminProcedure. */
export function UserActions({ userId, label, balance, status, isSelf }: UserActionsProps) {
  const router = useRouter();
  const [dialog, setDialog] = useState<null | "adjust" | "status">(null);
  const [dir, setDir] = useState<"grant" | "deduct">("grant");
  const [amount, setAmount] = useState("");
  const n = Math.max(0, Math.floor(Number(amount) || 0));
  const signed = dir === "grant" ? n : -n;
  const after = balance + signed;
  const suspend = status === "active";

  async function run(fn: () => Promise<unknown>) {
    try {
      await fn();
      router.refresh();
    } catch (err) {
      throw new Error(trpcErrorMessage(err), { cause: err });
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-2.5">
        <Button className="h-10 px-4 text-sm" onClick={() => setDialog("adjust")}>
          Adjust credits
        </Button>
        <Button
          variant="outline"
          className={cn("h-10 px-4 text-sm", suspend && "border-crit text-crit hover:bg-crit-bg")}
          disabled={isSelf}
          title={isSelf ? "You can't change your own account" : undefined}
          onClick={() => setDialog("status")}
        >
          {suspend ? "Suspend account" : "Reinstate account"}
        </Button>
      </div>

      <ReasonDialog
        open={dialog === "adjust"}
        onClose={() => setDialog(null)}
        title="Adjust credits"
        subtitle={`${label} · current balance ${fmtCredits(balance)}`}
        confirmLabel={n ? `${dir === "grant" ? "Grant" : "Deduct"} ${fmtCredits(n)} credits` : "Adjust"}
        onConfirm={(reason) => {
          if (!n) return Promise.reject(new Error("Enter an amount."));
          if (after < 0) return Promise.reject(new Error("The balance can't go below zero."));
          return run(() => trpc.admin.users.adjustCredits.mutate({ userId, credits: signed, reason }));
        }}
      >
        <div role="radiogroup" aria-label="Direction" className="flex gap-2">
          {(["grant", "deduct"] as const).map((d) => (
            <label
              key={d}
              className={cn(
                "flex flex-1 cursor-pointer items-center gap-2 rounded-lg p-3 text-sm font-semibold capitalize",
                dir === d ? "border-2 border-link bg-sel-bg" : "border border-border",
              )}
            >
              <input type="radio" name="dir" checked={dir === d} onChange={() => setDir(d)} className="accent-link" />
              {d}
            </label>
          ))}
        </div>
        <Field label="Credits">
          <Input type="number" min={1} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} className="font-mono" />
        </Field>
        <span className="text-[13px] text-text-2">
          Balance after: <strong className={cn("font-mono", after < 0 ? "text-crit" : "text-text")}>{fmtCredits(after)}</strong> · Recorded in the ledger and audit log.
        </span>
      </ReasonDialog>

      <ReasonDialog
        open={dialog === "status"}
        onClose={() => setDialog(null)}
        title={suspend ? "Suspend account?" : "Reinstate account?"}
        subtitle={label}
        danger={suspend}
        confirmLabel={suspend ? "Suspend account" : "Reinstate account"}
        onConfirm={(reason) => run(() => trpc.admin.users.setStatus.mutate({ userId, status: suspend ? "suspended" : "active", reason }))}
      >
        <p className="m-0 text-sm leading-normal text-text-2">
          {suspend
            ? "They'll see the on-hold screen and can't run any action. Their resumes and credits are kept unchanged."
            : "They'll get full access back immediately."}
        </p>
      </ReasonDialog>
    </>
  );
}
