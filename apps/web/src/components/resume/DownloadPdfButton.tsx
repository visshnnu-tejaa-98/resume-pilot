"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { trpc } from "@/lib/trpc-client";

/**
 * Exports a version as PDF (worker + Puppeteer, cached per content +
 * template) and saves it. Problems go to `onNotice` when given, else are
 * shown under the button.
 */
export function DownloadPdfButton({
  versionId,
  before,
  onNotice,
  className = "h-[38px] gap-2 px-4 text-sm",
  variant,
}: {
  versionId: string;
  /** Awaited first (e.g. a pending template change). */
  before?: () => Promise<unknown>;
  onNotice?: (msg: string | null) => void;
  className?: string;
  variant?: "primary" | "outline";
}) {
  const [busy, setBusy] = useState(false);
  const [own, setOwn] = useState<string | null>(null);
  const notice = onNotice ?? setOwn;

  const download = async () => {
    setBusy(true);
    notice(null);
    try {
      await before?.();
      let r = await trpc.versions.exportPdf.mutate({ versionId });
      const deadline = Date.now() + 90_000;
      while (r.status === "pending" && Date.now() < deadline) {
        await new Promise((ok) => setTimeout(ok, 1500));
        r = await trpc.versions.pdfStatus.query({ versionId });
      }
      if (r.status === "ready") await saveFile(r.url, r.fileName);
      else
        notice(
          r.status === "failed"
            ? r.error
            : "The PDF is taking longer than usual. Please try again in a minute.",
        );
    } catch {
      notice("We couldn't create the PDF. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="relative inline-flex">
      <Button
        variant={variant}
        className={className}
        onClick={() => void download()}
        disabled={busy}
        aria-busy={busy}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 4v12M6 10l6 6 6-6M4 20h16" />
        </svg>
        {busy ? "Preparing PDF…" : "Download PDF"}
      </Button>
      {!onNotice && own ? (
        <span
          role="status"
          className="absolute top-full right-0 z-10 mt-1.5 w-max max-w-[280px] rounded-md bg-surface px-2.5 py-1.5 text-xs text-crit shadow-modal"
        >
          {own}
        </span>
      ) : null}
    </span>
  );
}

/**
 * The signed URL is short-lived and cross-origin, so the `download`
 * attribute alone wouldn't apply our file name: fetch it as a blob first.
 * If that's blocked (CORS), open the URL instead.
 */
async function saveFile(url: string, fileName: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const href = URL.createObjectURL(await res.blob());
    Object.assign(document.createElement("a"), { href, download: fileName }).click();
    setTimeout(() => URL.revokeObjectURL(href), 10_000);
  } catch {
    window.open(url, "_blank", "noopener");
  }
}
