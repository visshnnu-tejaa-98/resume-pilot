"use client";

import { useClerk } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { PlusIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { routes } from "@/lib/routes";
import { useAppShellStore } from "@/stores/app-shell-store";
import { accountNav, isActive, isFocusRoute, workspaceNav, type AppNavItem } from "./nav";

function NavGroup({ label, items, pathname }: { label: string; items: AppNavItem[]; pathname: string }) {
  return (
    <nav aria-label={label} className="flex flex-col gap-0.5">
      <span className="px-3 pb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-text-2">{label}</span>
      {items.map((i) => {
        const on = isActive(i, pathname);
        return (
          <Link
            key={i.id}
            href={i.href}
            aria-current={on ? "page" : undefined}
            className={cn(
              "flex h-10 items-center gap-3 rounded-md px-3 text-sm no-underline",
              on ? "bg-surface-2 font-semibold text-text" : "font-medium text-text-2 hover:bg-surface-2 hover:text-text",
            )}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className={on ? "text-accent-text" : "text-text-2"}
            >
              <path d={i.d} />
            </svg>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Left navigation (design/screens/AppSide.dc.html). Fixed column on
 * large screens; an off-canvas drawer below `lg`, opened from the top
 * bar's menu button via the app-shell store.
 */
export function AppSidebar() {
  const pathname = usePathname();
  const { signOut } = useClerk();
  const open = useAppShellStore((s) => s.sidebarOpen);
  const close = useAppShellStore((s) => s.closeSidebar);
  const focus = isFocusRoute(pathname);

  // Close the drawer on navigation and on Escape.
  useEffect(() => close(), [pathname, close]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  return (
    <>
      {open ? <div className={cn("fixed inset-0 z-30 bg-scrim", !focus && "lg:hidden")} onClick={close} aria-hidden="true" /> : null}
      <aside
        id="app-sidebar"
        className={cn(
          "box-border flex w-[248px] flex-none flex-col gap-6 border-r border-border bg-input-bg px-3 py-5",
          focus
            ? cn("fixed inset-y-0 left-0 z-40 overflow-y-auto transition-transform", open ? "translate-x-0 shadow-modal" : "-translate-x-full")
            : cn(
                "max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-40 max-lg:overflow-y-auto max-lg:transition-transform",
                open ? "max-lg:translate-x-0 max-lg:shadow-modal" : "max-lg:-translate-x-full",
              ),
        )}
      >
        <Link
          href={routes.generate}
          className="flex h-11 items-center justify-center gap-2 rounded-md bg-brand text-[15px] font-bold text-brand-ink no-underline hover:brightness-105"
        >
          <PlusIcon />
          Tailor a resume
        </Link>
        <NavGroup label="Workspace" items={workspaceNav} pathname={pathname} />
        <NavGroup label="Account" items={accountNav} pathname={pathname} />
        <div className="mt-auto flex flex-col gap-0.5 border-t border-border pt-3">
          <Link href={routes.faq} className="flex h-9 items-center rounded-md px-3 text-sm text-text-2 no-underline hover:bg-surface-2">
            Help and FAQ
          </Link>
          <button
            type="button"
            onClick={() => signOut({ redirectUrl: routes.home })}
            className="flex h-9 cursor-pointer items-center rounded-md px-3 text-left text-sm text-text-2 hover:bg-surface-2"
          >
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
