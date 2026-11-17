"use client";

import Link from "next/link";
import { useState } from "react";
import { ResumeDocument } from "@/components/resume/ResumeDocument";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Field";
import { trpc } from "@/lib/trpc-client";
import type { VersionView } from "@/features/versions/types";
import { appRoutes } from "@/lib/routes";
import { TEMPLATES, type TemplateName } from "@/stores/preferences-store";

/**
 * Full-size preview + download (design/screens/Preview.dc.html). The PDF
 * is rendered by the worker with Puppeteer from the same template (m9) and
 * cached per content + template, so an unchanged version downloads at once.
 */
export function PreviewView({ version }: { version: VersionView }) {
  const [template, setTemplate] = useState<TemplateName>(version.template);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pages, setPages] = useState(1);
  const [templateSaved, setTemplateSaved] = useState<Promise<unknown>>(Promise.resolve());
  const pick = (t: TemplateName) => {
    setTemplate(t);
    // Remember the choice on the version; the preview doesn't wait for it, the download does.
    setTemplateSaved(trpc.versions.setTemplate.mutate({ versionId: version.id, template: t.toLowerCase() }).catch(() => undefined));
  };

  const download = async () => {
    setBusy(true);
    setNotice(null);
    try {
      await templateSaved;
      let r = await trpc.versions.exportPdf.mutate({ versionId: version.id });
      const deadline = Date.now() + 90_000;
      while (r.status === "pending" && Date.now() < deadline) {
        await new Promise((ok) => setTimeout(ok, 1500));
        r = await trpc.versions.pdfStatus.query({ versionId: version.id });
      }
      if (r.status === "ready") await saveFile(r.url, r.fileName);
      else setNotice(r.status === "failed" ? r.error : "The PDF is taking longer than usual. Please try again in a minute.");
    } catch {
      setNotice("We couldn't create the PDF. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-64px)] flex-col bg-canvas">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border bg-surface px-5 py-2.5">
        <Link href={appRoutes.version(version.id)} className="flex items-center gap-1.5 text-sm font-semibold text-link no-underline">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
          Back to editor
        </Link>
        <strong className="font-display text-base">
          {[version.company, version.role].filter(Boolean).join(" · ")}
        </strong>
        <label className="ml-auto flex items-center gap-2 text-sm text-text-2">
          Template
          <Select fieldSize="sm" value={template} onChange={(e) => pick(e.target.value as TemplateName)} className="h-[38px] w-auto bg-surface font-medium">
            {TEMPLATES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </label>
        <Button className="h-[38px] gap-2 px-4 text-sm" onClick={() => void download()} disabled={busy} aria-busy={busy}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 4v12M6 10l6 6 6-6M4 20h16" />
          </svg>
          {busy ? "Preparing PDF…" : "Download PDF"}
        </Button>
      </div>

      <div className="flex flex-1 flex-col items-center gap-4 px-5 pt-8 pb-12">
        {notice ? (
          <div role="status" className="flex items-center gap-3 rounded-lg bg-brand-ink px-4 py-3 text-sm text-on-hero shadow-[0_12px_30px_rgba(0,0,0,0.3)]">
            <span className="size-2 rounded-full bg-hero-accent" />
            {notice}
          </div>
        ) : null}
        <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-[13px] text-text-2">
          <span className="font-mono">{version.fileName}</span>
          <span>A4 · {pages} {pages === 1 ? "page" : "pages"} · selectable text · ATS-friendly single column</span>
          <span>Downloads are free</span>
        </div>
        <ResumeDocument resume={version.content} template={template} onPages={setPages} className="max-w-full" />
      </div>
    </div>
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
