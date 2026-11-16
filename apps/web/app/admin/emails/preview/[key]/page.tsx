import { EMAIL_PREVIEWS } from "@resume-pilot/emails";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { adminRoutes } from "@/components/admin/nav";
import { AppMain } from "@/components/app/PageHeader";
import { Chip } from "@/components/ui/Chip";
import { cn } from "@/lib/cn";
import { requireAdmin } from "@/server/admin";

export const metadata: Metadata = { title: "Email preview" };

/** Side-by-side light/dark preview of one email template with sample data. */
export default async function EmailPreviewPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ dark?: string }> }) {
  await requireAdmin();
  const [{ key }, sp] = await Promise.all([params, searchParams]);
  const preview = EMAIL_PREVIEWS.find((p) => p.key === key);
  if (!preview) notFound();
  const dark = sp.dark === "1";
  const base = `${adminRoutes.emails}/preview/${key}`;

  return (
    <AppMain className="gap-5">
      <div className="flex flex-col gap-1.5">
        <Link href={adminRoutes.emails} className="text-[13px] font-semibold text-link">
          ← Email templates
        </Link>
        <h1 className="m-0 flex flex-wrap items-center gap-3 font-display text-[28px] font-bold">
          {preview.name}
          <Chip tone={preview.kind === "marketing" ? "warn" : "info"} className="px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-[0.06em]">
            {preview.kind.toUpperCase()}
          </Chip>
        </h1>
        <span className="text-sm text-text-2">
          <strong className="text-text">Subject:</strong> {preview.subject}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label="Colour scheme" className="flex gap-1 rounded-lg bg-surface-2 p-1">
          {[
            [false, "Light"],
            [true, "Dark"],
          ].map(([d, label]) => (
            <Link
              key={String(label)}
              role="tab"
              aria-selected={dark === d}
              href={d ? `${base}?dark=1` : base}
              className={cn(
                "flex h-8 items-center rounded-md px-3 text-[13px] no-underline",
                dark === d ? "bg-surface font-semibold text-text shadow-sm" : "font-medium text-text-2",
              )}
            >
              {label as string}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {EMAIL_PREVIEWS.map((p) => (
            <Link
              key={p.key}
              href={`${adminRoutes.emails}/preview/${p.key}${dark ? "?dark=1" : ""}`}
              aria-current={p.key === key ? "page" : undefined}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-semibold no-underline",
                p.key === key ? "border-text bg-text text-surface" : "border-border text-text-2 hover:text-text",
              )}
            >
              {p.name}
            </Link>
          ))}
        </div>
      </div>

      <iframe
        title={`${preview.name} email preview`}
        src={`${base}/html${dark ? "?dark=1" : ""}`}
        sandbox=""
        className="h-[1200px] w-full max-w-[720px] self-center rounded-xl border border-border bg-white"
      />
      <span className="text-center text-xs text-text-2">Sample data. Real sends fill these fields from the user&apos;s account.</span>
    </AppMain>
  );
}
