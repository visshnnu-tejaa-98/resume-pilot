"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { appRoutes } from "@/lib/routes";
import { trpc, trpcErrorMessage } from "@/lib/trpc-client";

/** "…" menu on a version row: duplicate (free, no AI) and delete (30-day restore). */
export function VersionActions({ versionId, label }: { versionId: string; label: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      router.refresh();
    } catch (err) {
      window.alert(trpcErrorMessage(err));
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={`More actions for ${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy}
        onClick={() => setOpen((o) => !o)}
        className="flex cursor-pointer border-0 bg-transparent p-0 text-text-2 hover:text-text"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
        </svg>
      </button>
      {open ? (
        <div role="menu" className="absolute top-7 right-0 z-10 flex w-48 flex-col rounded-lg border border-border bg-surface py-1 text-left text-sm font-medium shadow-modal">
          <button
            type="button"
            role="menuitem"
            className="cursor-pointer border-0 bg-transparent px-3 py-2 text-left text-text hover:bg-surface-2"
            onClick={() =>
              void run(async () => {
                const r = await trpc.versions.duplicate.mutate({ versionId });
                router.push(appRoutes.version(r.versionId));
              })
            }
          >
            Duplicate (free)
          </button>
          <button
            type="button"
            role="menuitem"
            className="cursor-pointer border-0 bg-transparent px-3 py-2 text-left text-crit hover:bg-crit-bg"
            onClick={() => {
              if (window.confirm(`Delete "${label}"? You can restore it for 30 days.`)) void run(() => trpc.versions.delete.mutate({ versionId }));
            }}
          >
            Delete
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Restore button for the "Recently deleted" list. */
export function RestoreVersionButton({ versionId }: { versionId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await trpc.versions.restore.mutate({ versionId });
          router.refresh();
        } catch (err) {
          window.alert(trpcErrorMessage(err));
          setBusy(false);
        }
      }}
      className="cursor-pointer border-0 bg-transparent p-0 text-sm font-semibold text-link"
    >
      {busy ? "Restoring…" : "Restore"}
    </button>
  );
}
