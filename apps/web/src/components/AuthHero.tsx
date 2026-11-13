import Link from "next/link";

export interface AuthHeroStep {
  title: string;
  body: string;
}

export interface AuthHeroProps {
  headline: string;
  subtext?: string;
  steps?: AuthHeroStep[];
}

/**
 * Left-hand hero panel shared by /sign-in and /sign-up — matches
 * design/screens/SignIn.dc.html and SignUp.dc.html (dotted grid,
 * logo, headline, optional numbered step list, copyright).
 */
export function AuthHero({ headline, subtext, steps }: AuthHeroProps) {
  return (
    <aside
      className="relative flex flex-1 basis-[460px] flex-col justify-between gap-12 overflow-hidden p-10 sm:p-12"
      style={{ background: "var(--color-hero-navy)", color: "#F2F5F9" }}
    >
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 640 900"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <defs>
          <pattern id="auth-hero-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M40 0H0V40" fill="none" stroke="#FFFFFF" strokeOpacity="0.05" />
          </pattern>
        </defs>
        <rect width="640" height="900" fill="url(#auth-hero-grid)" />
        {!steps && (
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
        )}
      </svg>

      <Link
        href="/"
        aria-label="Resume Pilot home"
        className="relative flex items-center gap-2.5 no-underline"
        style={{ color: "#F2F5F9" }}
      >
        <svg width="30" height="30" viewBox="0 0 28 28" aria-hidden="true">
          <rect width="28" height="28" rx="7" fill="#FF9900" />
          <path d="M6.5 14.8 21 8l-4.6 13.2-2.7-4.9-7.2-1.5Z" fill="#0F1B2A" />
        </svg>
        <span
          style={{
            fontFamily: "'Space Grotesk', Inter, sans-serif",
            fontSize: 20,
            fontWeight: 700,
          }}
        >
          Resume<span style={{ color: "#FF9900" }}>Pilot</span>
        </span>
      </Link>

      <div className="relative flex max-w-[460px] flex-col gap-7">
        <h1
          style={{
            margin: 0,
            fontFamily: "'Space Grotesk', Inter, sans-serif",
            fontSize: "clamp(32px, 4vw, 44px)",
            lineHeight: 1.08,
            letterSpacing: "-0.02em",
          }}
        >
          {headline}
        </h1>

        {subtext && (
          <p
            style={{
              margin: 0,
              fontSize: 17,
              lineHeight: 1.6,
              color: "var(--color-hero-text-secondary)",
            }}
          >
            {subtext}
          </p>
        )}

        {steps && (
          <div className="flex flex-col">
            {steps.map((step, i) => {
              const isFirst = i === 0;
              const isLast = i === steps.length - 1;
              return (
                <div key={step.title} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <span
                      className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full"
                      style={{
                        background: isFirst ? "#FF9900" : "#1B2A3D",
                        color: isFirst ? "#0F1B2A" : "#F2F5F9",
                        font: "600 12px 'JetBrains Mono', monospace",
                      }}
                    >
                      {i + 1}
                    </span>
                    <span
                      className="min-h-[22px] flex-1 border-l-2 border-dashed"
                      style={{ borderColor: isLast ? "transparent" : "#4A5F78" }}
                    />
                  </div>
                  <div className="flex flex-col gap-0.5 pb-[18px]">
                    <strong style={{ fontSize: 16 }}>{step.title}</strong>
                    <span style={{ fontSize: 14, color: "var(--color-hero-text-secondary)" }}>
                      {step.body}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <span className="relative text-[13px]" style={{ color: "var(--color-hero-muted)" }}>
        © {new Date().getFullYear()} Resume Pilot
      </span>
    </aside>
  );
}
