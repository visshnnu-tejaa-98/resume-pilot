import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { ThemeSwitch } from "@/components/theme/ThemeSwitch";
import { footerColumns, SUPPORT_EMAIL } from "@/lib/routes";

/** Public-site footer (design/screens/SiteFooter.dc.html). */
export function SiteFooter() {
  return (
    <footer className="border-t border-bar-line bg-bar text-on-hero">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-10 px-6 pt-14 pb-8">
        <div className="flex flex-wrap justify-between gap-x-16 gap-y-10">
          <div className="flex max-w-[340px] flex-col gap-3.5">
            <Logo />
            <p className="m-0 text-sm leading-[1.6] text-on-hero-3">
              One resume. Every opportunity. Tailored with AI, without inventing a single fact.
            </p>
          </div>
          <div className="flex flex-wrap gap-x-[72px] gap-y-8">
            {footerColumns.map((col) => (
              <nav key={col.title} aria-label={col.title} className="flex flex-col gap-2.5">
                <span className="text-xs font-semibold uppercase tracking-[0.08em] text-on-hero-muted">{col.title}</span>
                {col.links.map((l) => (
                  <Link key={l.href} href={l.href} className="text-sm text-on-hero-link no-underline hover:underline">
                    {l.label}
                  </Link>
                ))}
              </nav>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-bar-line pt-5 text-[13px] text-on-hero-muted">
          <span>© {new Date().getFullYear()} Resume Pilot. Prices in INR.</span>
          <span>Payments secured by Razorpay · Support: {SUPPORT_EMAIL}</span>
          <ThemeSwitch />
        </div>
      </div>
    </footer>
  );
}
