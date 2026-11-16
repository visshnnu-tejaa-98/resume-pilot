"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { cn } from "@/lib/cn";
import { useAppShellStore } from "@/stores/app-shell-store";
import { adminNav, isAdminActive, type AdminBadgeKey } from "./nav";

/** design/screens/AdminSide.dc.html — drawer below `lg`, like the user app. */
export function AdminSidebar({ badges }: { badges: Record<AdminBadgeKey, number> }) {
  const pathname = usePathname();
  const open = useAppShellStore((s) => s.sidebarOpen);
  const close = useAppShellStore((s) => s.closeSidebar);
  useEffect(() => close(), [pathname, close]);

  return (
    <>
      {open ? <div className="fixed inset-0 z-30 bg-scrim lg:hidden" onClick={close} aria-hidden="true" /> : null}
      <aside
        id="app-sidebar"
        className={cn(
          "box-border flex w-[248px] flex-none flex-col gap-5 border-r border-border bg-input-bg px-3 py-[18px]",
          "max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-40 max-lg:overflow-y-auto max-lg:transition-transform",
          open ? "max-lg:translate-x-0 max-lg:shadow-modal" : "max-lg:-translate-x-full",
        )}
      >
        {adminNav.map((g) => (
          <nav key={g.title} aria-label={g.title} className="flex flex-col gap-0.5">
            <span className="px-3 pb-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-text-2">{g.title}</span>
            {g.items.map((i) => {
              const on = isAdminActive(i, pathname);
              const badge = i.badge ? badges[i.badge] : 0;
              return (
                <Link
                  key={i.href}
                  href={i.href}
                  aria-current={on ? "page" : undefined}
                  className={cn(
                    "flex h-[38px] items-center gap-3 rounded-md px-3 text-sm no-underline",
                    on ? "bg-surface-2 font-semibold text-text" : "font-medium text-text-2 hover:bg-surface-2 hover:text-text",
                  )}
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={on ? "text-accent-text" : "text-text-2"}>
                    <path d={i.d} />
                  </svg>
                  <span className="flex-1">{i.label}</span>
                  {badge > 0 ? <span className="font-mono text-[11px] font-semibold text-crit">{badge}</span> : null}
                </Link>
              );
            })}
          </nav>
        ))}
        <div className="mt-auto border-t border-border px-3 pt-3 text-xs leading-normal text-text-2">Every admin action is written to the audit log.</div>
      </aside>
    </>
  );
}
