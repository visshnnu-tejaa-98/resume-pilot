"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Textarea } from "@/components/ui/Field";

interface ReasonDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  children?: ReactNode;
  /** Resolves on success; a thrown Error's message is shown. */
  onConfirm: (reason: string) => Promise<void>;
}

/**
 * Every admin write needs a reason for the audit log (prd.md §2.2). This
 * dialog collects it, runs the action and surfaces the server's error.
 */
export function ReasonDialog({ open, onClose, title, subtitle, confirmLabel, danger, children, onConfirm }: ReasonDialogProps) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
      setReason("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={title} subtitle={subtitle} width={460}>
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        {children}
        <Field label="Reason (required)" help="Written to the audit log under your name.">
          <Textarea rows={3} required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {error ? (
          <p role="alert" className="m-0 text-sm text-crit">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2.5 border-t border-border pt-4">
          <Button variant="ghost" className="h-11 px-4" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            className={danger ? "h-11 bg-crit px-5 text-white dark:text-[#2A0B07]" : "h-11 px-5"}
            disabled={busy || reason.trim().length < 3}
          >
            {busy ? "Saving…" : confirmLabel}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
