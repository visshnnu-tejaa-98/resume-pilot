"use client";

import Link from "next/link";
import { useState } from "react";
import { ResumeDocument } from "@/components/resume/ResumeDocument";
import { DownloadPdfButton } from "@/components/resume/DownloadPdfButton";
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
  const [pages, setPages] = useState(1);
  const [templateSaved, setTemplateSaved] = useState<Promise<unknown>>(Promise.resolve());
  const pick = (t: TemplateName) => {
    setTemplate(t);
    // Remember the choice on the version; the preview doesn't wait for it, the download does.
    setTemplateSaved(
      trpc.versions.setTemplate
        .mutate({ versionId: version.id, template: t.toLowerCase() })
        .catch(() => undefined),
    );
  };

  return (
    <div className="flex min-h-[calc(100vh-64px)] flex-col bg-canvas">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border bg-surface px-5 py-2.5">
        <Link
          href={appRoutes.version(version.id)}
          className="flex items-center gap-1.5 text-sm font-semibold text-link no-underline"
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
            <path d="M15 6l-6 6 6 6" />
          </svg>
          Back to editor
        </Link>
        <strong className="font-display text-base">
          {[version.company, version.role].filter(Boolean).join(" · ")}
        </strong>
        <label className="ml-auto flex items-center gap-2 text-sm text-text-2">
          Template
          <Select
            fieldSize="sm"
            value={template}
            onChange={(e) => pick(e.target.value as TemplateName)}
            className="h-[38px] w-auto bg-surface font-medium"
          >
            {TEMPLATES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </label>
        <DownloadPdfButton
          versionId={version.id}
          before={() => templateSaved}
          onNotice={setNotice}
        />
      </div>

      <div className="flex flex-1 flex-col items-center gap-4 px-5 pt-8 pb-12">
        {notice ? (
          <div
            role="status"
            className="flex items-center gap-3 rounded-lg bg-brand-ink px-4 py-3 text-sm text-on-hero shadow-[0_12px_30px_rgba(0,0,0,0.3)]"
          >
            <span className="size-2 rounded-full bg-hero-accent" />
            {notice}
          </div>
        ) : null}
        <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-[13px] text-text-2">
          <span className="font-mono">{version.fileName}</span>
          <span>
            A4 · {pages} {pages === 1 ? "page" : "pages"} · selectable text · ATS-friendly single
            column
          </span>
          <span>Downloads are free</span>
        </div>
        <ResumeDocument
          resume={version.content}
          template={template}
          onPages={setPages}
          className="max-w-full"
        />
      </div>
    </div>
  );
}
