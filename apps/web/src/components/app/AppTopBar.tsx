"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { LogoMark } from "@/components/brand/Logo";
import { SearchIcon } from "@/components/ui/icons";
import { routes } from "@/lib/routes";
import { useAppShellStore } from "@/stores/app-shell-store";
import Link from "next/link";
import { Avatar } from "./Avatar";
import { BalancePill } from "./BalancePill";
import { isFocusRoute } from "./nav";
import { cn } from "@/lib/cn";

interface AppTopBarProps {
  name: string | null;
  initialBalance: number;
}

/** Navy app header (design/screens/AppTopBar.dc.html). */
export function AppTopBar({ name, initialBalance }: AppTopBarProps) {
  const router = useRouter();
  const focus = isFocusRoute(usePathname());
  const toggle = useAppShellStore((s) => s.toggleSidebar);
  const open = useAppShellStore((s) => s.sidebarOpen);
  const [q, setQ] = useState("");

  function search(e: FormEvent) {
    e.preventDefault();
    const term = q.trim();
    router.push(term ? `${routes.resumes}?q=${encodeURIComponent(term)}` : routes.resumes);
  }

  return (
    <header className="sticky top-0 z-20 border-b border-bar-line bg-bar text-on-hero">
      <div className="flex min-h-16 flex-wrap items-center gap-x-5 gap-y-3 px-5 py-3 lg:py-0">
        <button
          type="button"
          onClick={toggle}
          aria-label="Open menu"
          aria-controls="app-sidebar"
          aria-expanded={open}
          className={cn("flex size-9 cursor-pointer items-center justify-center rounded-md text-on-hero hover:bg-bar-active", !focus && "lg:hidden")}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        <Link href={routes.dashboard} aria-label="Resume Pilot dashboard" className="flex items-center gap-2.5 text-on-hero no-underline">
          <LogoMark />
          <span className="font-display text-[19px] font-bold">
            Resume<span className="text-brand">Pilot</span>
          </span>
        </Link>
        <form
          role="search"
          onSubmit={search}
          className="flex h-[38px] max-w-[420px] flex-[1_1_260px] items-center gap-2 rounded-md border border-hero-line bg-bar-field px-3 text-on-hero-3 max-md:order-last max-md:max-w-none max-md:basis-full"
        >
          <SearchIcon size={16} />
          <label htmlFor="app-search" className="sr-only">
            Search
          </label>
          <input
            id="app-search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search resumes and jobs"
            className="min-w-0 flex-1 border-0 bg-transparent text-sm text-on-hero outline-none placeholder:text-on-hero-3"
          />
        </form>
        <div className="ml-auto flex items-center gap-2.5">
          <BalancePill href={routes.wallet} initialBalance={initialBalance} />
          <Link
            href={routes.wallet}
            className="flex h-9 items-center rounded-md bg-brand px-3.5 text-sm font-bold text-brand-ink no-underline hover:brightness-105 max-sm:hidden"
          >
            Add money
          </Link>
          <Avatar name={name} href={routes.settings} />
        </div>
      </div>
    </header>
  );
}
