"use client";

import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/brand/Logo";
import { ButtonLink } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { routes, siteNavLinks } from "@/lib/routes";

/** Public-site header (design/screens/SiteNav.dc.html). */
export function SiteNav() {
  const pathname = usePathname();
  const { isLoaded, isSignedIn } = useAuth();

  return (
    <header className="border-b border-bar-line bg-bar text-on-hero">
      <div className="mx-auto flex min-h-[72px] max-w-[1280px] flex-wrap items-center gap-x-8 gap-y-4 px-6">
        <Logo size="lg" />
        <nav aria-label="Main" className="flex flex-auto flex-wrap gap-1">
          {siteNavLinks.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-2.5 text-[15px] font-medium no-underline",
                  active ? "bg-bar-active text-white" : "text-on-hero-2 hover:text-white",
                )}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          {isLoaded && isSignedIn ? (
            <ButtonLink href={routes.dashboard} variant="brand" size="sm" className="font-semibold">
              Go to dashboard
            </ButtonLink>
          ) : (
            <>
              <Link
                href={routes.signIn}
                className="rounded-md px-3.5 py-2.5 text-[15px] font-semibold text-on-hero no-underline hover:bg-bar-active"
              >
                Sign in
              </Link>
              <ButtonLink href={routes.signUp} variant="brand" size="sm" className="font-semibold">
                Get started free
              </ButtonLink>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
