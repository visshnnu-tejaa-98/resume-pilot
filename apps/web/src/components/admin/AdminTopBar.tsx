"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { initialsOf } from "@/components/app/Avatar";
import { LogoMark } from "@/components/brand/Logo";
import { SearchIcon } from "@/components/ui/icons";
import { routes } from "@/lib/routes";
import { useAppShellStore } from "@/stores/app-shell-store";
import { adminRoutes } from "./nav";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** design/screens/AdminTopBar.dc.html — orange underline marks admin mode. */
export function AdminTopBar({ name, env }: { name: string; env: string }) {
  const router = useRouter();
  const toggle = useAppShellStore((s) => s.toggleSidebar);
  const [q, setQ] = useState("");

  /** Payment ids → payments, uuids → user, anything else → user search. */
  function search(e: FormEvent) {
    e.preventDefault();
    const term = q.trim();
    if (!term) return;
    if (/^(pay|order)_/i.test(term)) router.push(`${adminRoutes.payments}?q=${encodeURIComponent(term)}`);
    else if (UUID.test(term)) router.push(adminRoutes.user(term));
    else router.push(`${adminRoutes.users}?q=${encodeURIComponent(term)}`);
  }

  return (
    <header className="sticky top-0 z-20 border-b-2 border-brand bg-bar text-on-hero">
      <div className="flex min-h-[62px] flex-wrap items-center gap-x-5 gap-y-3 px-5 py-2.5 lg:py-0">
        <button
          type="button"
          onClick={toggle}
          aria-label="Open menu"
          aria-controls="app-sidebar"
          className="flex size-9 cursor-pointer items-center justify-center rounded-md text-on-hero hover:bg-bar-active lg:hidden"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        <Link href={adminRoutes.overview} aria-label="Resume Pilot admin" className="flex items-center gap-2.5 text-on-hero no-underline">
          <LogoMark />
          <span className="font-display text-[19px] font-bold">
            Resume<span className="text-brand">Pilot</span>
          </span>
          <span className="rounded border border-brand px-2 py-1 font-mono text-[11px] font-bold tracking-[0.1em] text-hero-accent">ADMIN</span>
        </Link>
        <span className="rounded bg-hero-chip px-2 py-1 font-mono text-xs font-semibold text-on-hero-3 max-sm:hidden">env: {env}</span>
        <form
          role="search"
          onSubmit={search}
          className="flex h-[38px] max-w-[460px] flex-[1_1_260px] items-center gap-2 rounded-md border border-hero-line bg-bar-field px-3 text-on-hero-3 max-md:order-last max-md:max-w-none max-md:basis-full"
        >
          <SearchIcon size={16} />
          <label htmlFor="admin-search" className="sr-only">
            Search
          </label>
          <input
            id="admin-search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search users, payment IDs, user IDs"
            className="min-w-0 flex-1 border-0 bg-transparent text-sm text-on-hero outline-none placeholder:text-on-hero-3"
          />
        </form>
        <div className="ml-auto flex items-center gap-3">
          <Link href={routes.dashboard} className="text-sm font-semibold text-on-hero-2 no-underline hover:text-white">
            Exit admin
          </Link>
          <span aria-label={`Signed in as ${name}`} className="flex size-9 items-center justify-center rounded-full bg-brand text-[13px] font-bold text-brand-ink">
            {initialsOf(name)}
          </span>
        </div>
      </div>
    </header>
  );
}
