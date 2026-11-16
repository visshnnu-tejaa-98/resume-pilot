import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteNav } from "@/components/site/SiteNav";
import { Container, Split } from "@/components/site/Section";
import { ButtonLink } from "@/components/ui/Button";
import { Heading } from "@/components/ui/Typography";
import { routes } from "@/lib/routes";

/** design/screens/NotFound.dc.html — rendered for any unmatched URL. */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-bg text-text">
      <SiteNav />
      <main className="flex-1">
        <Container width="sm" className="pt-[72px] pb-[88px]">
          <Split min={420} className="gap-10">
            <div className="flex flex-col gap-[18px]">
              <span className="font-mono text-sm font-semibold text-accent-text">ERROR 404 · OFF ROUTE</span>
              <Heading as="h1" size="md" className="text-[clamp(34px,5vw,52px)]">
                This page isn&apos;t on the flight plan.
              </Heading>
              <p className="m-0 text-[17px] leading-[1.6] text-text-2">
                The link may be old or mistyped. Let&apos;s get you back on course.
              </p>
              <div className="mt-1 flex flex-wrap gap-3">
                <ButtonLink href={routes.home} size="lg">
                  Back to home
                </ButtonLink>
                <ButtonLink href={routes.contact} variant="outline" size="lg" className="px-5">
                  Contact support
                </ButtonLink>
              </div>
            </div>
            <svg viewBox="0 0 440 280" width="100%" role="img" aria-label="A dashed route that veers off its path">
              <path d="M20 240 C 110 240, 150 150, 230 150" fill="none" className="stroke-link" strokeWidth="3" strokeDasharray="10 10" />
              <path d="M230 150 C 300 150, 330 90, 410 60" fill="none" className="stroke-border-strong" strokeWidth="2" strokeDasharray="4 10" />
              <path d="M230 150 C 280 170, 300 230, 360 250" fill="none" className="stroke-accent" strokeWidth="3" strokeDasharray="10 10" />
              <circle cx="20" cy="240" r="9" className="fill-link" />
              <circle cx="410" cy="60" r="10" fill="none" className="stroke-border-strong" strokeWidth="2.5" />
              <g transform="translate(360 250) rotate(20)">
                <rect x="-22" y="-22" width="44" height="44" rx="11" className="fill-accent" />
                <path d="M-11 1.5 11 -9l-7 20-4-7.5-11-2Z" className="fill-on-accent" />
              </g>
              <text x="410" y="96" textAnchor="middle" className="fill-text-2 font-mono" fontSize="13">
                your page
              </text>
            </svg>
          </Split>
        </Container>
      </main>
      <SiteFooter />
    </div>
  );
}
