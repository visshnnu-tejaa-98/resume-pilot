import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ensureUserSynced } from "@/server/ensure-user";

export async function requireUser() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  return ensureUserSynced(userId);
}

export function JobsShell({ crumb, title, subtitle, children }: { crumb: string; title: string; subtitle?: string; children: ReactNode }) {
  return (
    <main style={{ background: "var(--color-background)", minHeight: "100vh" }} className="px-4 py-8 sm:px-8">
      <div className="mx-auto flex w-full max-w-[860px] flex-col gap-5">
        <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
          <Link href="/jobs" style={{ color: "var(--color-link)" }}>Job descriptions</Link> / {crumb}
        </span>
        <h1 style={{ margin: 0, fontFamily: "'Space Grotesk', Inter, sans-serif", fontSize: 30 }}>{title}</h1>
        {subtitle && <span style={{ color: "var(--color-text-secondary)" }}>{subtitle}</span>}
        <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 10, padding: 20 }}>
          {children}
        </div>
      </div>
    </main>
  );
}
