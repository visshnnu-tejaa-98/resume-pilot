import type { ReactNode } from "react";
import { Logo } from "@/components/brand/Logo";
import { Heading } from "@/components/ui/Typography";
import { cn } from "@/lib/cn";

export interface AuthStep {
  title: string;
  body: string;
}

interface AuthShellProps {
  headline: string;
  subtext?: string;
  /** Vertical numbered route (sign-up). Replaces the flight-path art. */
  steps?: readonly AuthStep[];
  /** Max width of the form column. */
  formWidth?: 420 | 440;
  children: ReactNode;
}

function HeroArt({ withRoute }: { withRoute: boolean }) {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 640 900"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <pattern id="rp-auth-grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M40 0H0V40" fill="none" stroke="#FFFFFF" strokeOpacity="0.05" />
        </pattern>
      </defs>
      <rect width="640" height="900" fill="url(#rp-auth-grid)" />
      {withRoute ? (
        <>
          <path
            d="M40 760 C 200 760, 240 520, 380 520 S 560 330, 600 260"
            fill="none"
            stroke="#FF9900"
            strokeOpacity="0.6"
            strokeWidth="2"
            strokeDasharray="8 10"
          />
          <circle cx="40" cy="760" r="6" fill="#FF9900" />
          <circle cx="380" cy="520" r="5" fill="#FF9900" fillOpacity="0.7" />
          <circle cx="600" cy="260" r="6" fill="none" stroke="#FF9900" strokeWidth="2" />
        </>
      ) : null}
    </svg>
  );
}

function VerticalRoute({ steps }: { steps: readonly AuthStep[] }) {
  return (
    <ol className="m-0 flex list-none flex-col p-0">
      {steps.map((s, i) => (
        <li key={s.title} className="flex gap-4">
          <div className="flex flex-col items-center">
            <span
              className={cn(
                "flex size-[30px] flex-none items-center justify-center rounded-full font-mono text-xs font-semibold",
                i === 0 ? "bg-brand text-brand-ink" : "bg-hero-chip text-on-hero",
              )}
            >
              {i + 1}
            </span>
            <span
              className={cn(
                "min-h-[22px] flex-1 border-l-2 border-dashed",
                i === steps.length - 1 ? "border-transparent" : "border-hero-line-strong",
              )}
            />
          </div>
          <div className="flex flex-col gap-0.5 pb-[18px]">
            <strong className="text-base">{s.title}</strong>
            <span className="text-sm text-on-hero-3">{s.body}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * Split layout for /sign-in and /sign-up (design/screens/SignIn.dc.html,
 * SignUp.dc.html): navy hero on the left, form column on the right.
 * Wraps to a single column on narrow screens.
 */
export function AuthShell({ headline, subtext, steps, formWidth = 420, children }: AuthShellProps) {
  return (
    <div className="flex min-h-screen flex-wrap bg-bg text-text">
      <aside className="relative flex flex-[1_1_460px] flex-col justify-between gap-12 overflow-hidden bg-hero px-12 py-10 text-on-hero max-sm:px-6">
        <HeroArt withRoute={!steps} />
        <Logo size="lg" className="relative self-start" />
        <div className={cn("relative flex max-w-[460px] flex-col", steps ? "gap-7" : "gap-[18px]")}>
          <Heading as="h1" className="text-[clamp(32px,4vw,44px)] leading-[1.08] tracking-[-0.02em]">
            {headline}
          </Heading>
          {subtext ? <p className="m-0 text-[17px] leading-[1.6] text-on-hero-2">{subtext}</p> : null}
          {steps ? <VerticalRoute steps={steps} /> : null}
        </div>
        <span className="relative text-[13px] text-on-hero-muted">© {new Date().getFullYear()} Resume Pilot</span>
      </aside>
      <main className="flex flex-[1_1_520px] items-center justify-center px-6 py-12">
        <div className={cn("flex w-full flex-col gap-[22px]", formWidth === 440 ? "max-w-[440px]" : "max-w-[420px]")}>
          {children}
        </div>
      </main>
    </div>
  );
}
