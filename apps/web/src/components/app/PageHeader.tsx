import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

/**
 * Main content column used by every app screen. Fills the space next to
 * the sidebar and stays centred, capped so lines don't get too long on
 * very wide monitors. `md` is for form-heavy pages (upload, settings).
 */
export function AppMain({ width = "lg", className, ...rest }: ComponentProps<"main"> & { width?: "md" | "lg" | "full" }) {
  return (
    <main
      className={cn(
        "mx-auto box-border flex w-full flex-col gap-7 px-8 py-8 max-sm:p-4 2xl:px-10",
        width === "md" && "max-w-[1280px]",
        width === "lg" && "max-w-[1600px]",
        className,
      )}
      {...rest}
    />
  );
}

interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  crumbs?: { href: string; label: string }[];
}

/** H1 + subline on the left, actions on the right. */
export function PageHeader({ title, subtitle, actions, crumbs }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1.5">
        {crumbs?.length ? (
          <nav aria-label="Breadcrumb" className="text-[13px] text-text-2">
            {crumbs.map((c) => (
              <span key={c.href}>
                <Link href={c.href} className="text-link no-underline hover:underline">
                  {c.label}
                </Link>
                {" / "}
              </span>
            ))}
          </nav>
        ) : null}
        <h1 className="m-0 font-display text-[30px] font-bold leading-tight">{title}</h1>
        {subtitle ? <span className="text-[15px] text-text-2">{subtitle}</span> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2.5">{actions}</div> : null}
    </div>
  );
}

/** Section heading with an optional right-aligned link. */
export function SectionTitle({ title, action, size = "md" }: { title: string; action?: ReactNode; size?: "sm" | "md" }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className={cn("m-0 font-display font-bold", size === "sm" ? "text-lg" : "text-xl")}>{title}</h2>
      {action}
    </div>
  );
}
