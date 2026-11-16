import Link from "next/link";
import { AtsReportPreview } from "@/components/marketing/AtsReportPreview";
import { ProductMock } from "@/components/marketing/ProductMock";
import { LaunchOfferCard } from "@/components/marketing/TopUpCard";
import { HeroBackdrop, RouteCurve, StopDot } from "@/components/site/RouteDecor";
import { AutoGrid, Band, Container, Split } from "@/components/site/Section";
import { ButtonLink, TextLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { ArrowRightIcon, CheckIcon, CrossIcon } from "@/components/ui/icons";
import { Eyebrow, Heading, Lead } from "@/components/ui/Typography";
import { cn } from "@/lib/cn";
import { routes } from "@/lib/routes";
import { flightRoute, PAID_STOP, pilotNever, pilotWill, pricing, uploadFormats } from "@/content/marketing";

/** design/screens/Landing.dc.html */
export default function LandingPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-hero text-on-hero">
        <HeroBackdrop />
        <Container className="relative pt-[88px] pb-24">
          <Split min={520} className="gap-14">
            <div className="flex flex-col gap-6">
              <Link
                href={routes.signUp}
                className="flex items-center gap-2.5 self-start rounded-full border border-hero-line bg-hero-chip py-1.5 pr-3.5 pl-1.5 text-sm text-on-hero no-underline"
              >
                <span className="rounded-full bg-brand px-2.5 py-[3px] text-xs font-bold text-brand-ink">{pricing.launchCode}</span>
                {pricing.launchCredits} when you sign up
              </Link>
              <Heading as="h1" size="hero">
                One resume.
                <br />
                Every job.
                <br />
                <span className="text-brand">Zero fiction.</span>
              </Heading>
              <p className="m-0 max-w-[560px] text-[19px] leading-[1.6] text-pretty text-on-hero-2">
                Upload the resume you already have, paste a job description, and get a tailored, ATS-friendly version in
                minutes. Resume Pilot rewrites and reorders what you&apos;ve done. It never invents what you haven&apos;t.
              </p>
              <div className="flex flex-wrap gap-3">
                <ButtonLink href={routes.signUp} variant="brand" size="xl">
                  Upload your resume free
                  <ArrowRightIcon />
                </ButtonLink>
                <ButtonLink href={routes.howItWorks} variant="outline-hero" size="xl" className="px-[22px] text-base">
                  See how it works
                </ButtonLink>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-on-hero-3">
                {["Upload and extraction free", "Pay only for successful runs", "Credits never expire"].map((t) => (
                  <span key={t} className="flex items-center gap-1.5">
                    <CheckIcon size={16} className="text-hero-good" />
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <ProductMock />
          </Split>
        </Container>
      </section>

      {/* Formats */}
      <section className="border-b border-border bg-surface">
        <Container className="flex flex-wrap items-center justify-between gap-x-10 gap-y-4 py-7">
          <span className="text-[15px] font-semibold">Works with the resume you already have</span>
          <div className="flex flex-wrap gap-2.5">
            {uploadFormats.map((f) => (
              <Chip key={f} tone="format" size="md">
                {f}
              </Chip>
            ))}
          </div>
          <span className="text-sm text-text-2">Scanned copies work too</span>
        </Container>
      </section>

      {/* Flight route */}
      <Container id="route" className="flex flex-col gap-12 py-24">
        <div className="flex max-w-[720px] flex-col gap-3">
          <Eyebrow>The flight route</Eyebrow>
          <Heading size="section">From upload to interview-ready in five stops.</Heading>
        </div>
        <AutoGrid min={220} className="gap-6">
          {flightRoute.map((s, i) => (
            <div key={s.id} className="flex flex-col gap-3.5">
              <StopDot n={i + 1} highlight={i === PAID_STOP} last={i === flightRoute.length - 1} />
              <h3 className="m-0 font-display text-xl font-bold">{s.title}</h3>
              <p className="m-0 text-[15px] leading-[1.6] text-text-2">{s.body}</p>
              <span className={cn("font-mono text-xs font-semibold", s.cost === "Free" ? "text-good" : "text-text-2")}>
                {s.cost}
              </span>
            </div>
          ))}
        </AutoGrid>
      </Container>

      {/* Grounded by design */}
      <Band>
        <Container>
          <Split className="gap-14 py-24">
            <div className="flex flex-col gap-[18px]">
              <Eyebrow>Grounded by design</Eyebrow>
              <Heading size="section">Your experience, said better. Never made up.</Heading>
              <Lead>
                Every generated resume is checked against your original before you see it. Companies, titles, dates, skills
                and numbers must match what you gave us. If a job asks for something you don&apos;t have, we show it as a
                gap so you can decide what to do.
              </Lead>
              <p className="m-0 text-[15px] leading-[1.6] text-text-2">You can still edit anything by hand. Your edits are yours.</p>
            </div>
            <AutoGrid min={240} className="gap-4">
              <RuleCard title="Pilot will" icon={<CheckIcon size={20} className="text-good" />} items={pilotWill} />
              <RuleCard title="Pilot never" icon={<CrossIcon size={20} className="text-text-2" />} items={pilotNever} />
            </AutoGrid>
          </Split>
        </Container>
      </Band>

      {/* ATS report */}
      <Container>
        <Split className="gap-14 py-24">
          <AtsReportPreview />
          <div className="flex flex-col gap-[18px]">
            <Eyebrow>ATS score and report</Eyebrow>
            <Heading size="section">See exactly why a resume scores the way it does.</Heading>
            <Lead>
              Score any version against any job: your original, a tailored version, or one you just edited. The report shows
              matched keywords with the line that proves them, the gaps, and what to fix. Compare the original and tailored
              scores side by side.
            </Lead>
            <p className="m-0 text-sm leading-[1.6] text-text-2">
              The score is an estimate of compatibility. Employers&apos; ATS systems differ.
            </p>
          </div>
        </Split>
      </Container>

      {/* Pricing teaser */}
      <Band>
        <Container>
          <Split className="gap-12 py-24">
            <div className="flex flex-col gap-[18px]">
              <Eyebrow>Pricing</Eyebrow>
              <Heading size="section">No subscription. Top up when you need to.</Heading>
              <Lead>
                Add money to your wallet and get credits. Before every paid action you see the estimate, and you only pay
                what&apos;s actually used. Failed runs are free.
              </Lead>
              <TextLink href={routes.pricing} className="self-start text-base underline">
                See full pricing
              </TextLink>
            </div>
            <AutoGrid min={260} className="gap-4">
              <Card tone="hero" radius="lg" className="flex flex-col gap-3.5 p-7">
                <span className="text-[13px] font-semibold text-on-hero-3">Wallet top-up</span>
                <span className="font-display text-5xl leading-none font-bold">{pricing.topUpInr}</span>
                <span className="font-mono text-lg font-semibold text-hero-accent">{pricing.topUpCredits}</span>
                <span className="text-sm text-on-hero-3">Never expire · top up any time</span>
                <ButtonLink href={routes.signUp} variant="brand" block className="mt-2 h-[46px]">
                  Get started
                </ButtonLink>
              </Card>
              <LaunchOfferCard footnote="One code per account.">
                Apply this code after you sign up and get <strong>{pricing.launchCredits}</strong>.
              </LaunchOfferCard>
            </AutoGrid>
          </Split>
        </Container>
      </Band>

      {/* Final CTA */}
      <Container className="py-24">
        <Card tone="hero" className="flex flex-wrap items-center justify-between gap-7 rounded-[18px] px-12 py-14 max-sm:px-6">
          <RouteCurve
            width={420}
            height={160}
            d="M0 150 C 120 150, 180 40, 300 50 S 400 20, 420 10"
            className="-right-5 -bottom-5 opacity-60"
          />
          <div className="relative flex max-w-[640px] flex-col gap-2.5">
            <Heading className="text-[clamp(28px,3.5vw,40px)] leading-[1.1] tracking-[-0.02em]">
              Your next application deserves its own resume.
            </Heading>
            <p className="m-0 text-[17px] text-on-hero-2">Upload once. Tailor for every job you apply to.</p>
          </div>
          <ButtonLink href={routes.signUp} variant="brand" size="xl" className="relative">
            Upload your resume free
          </ButtonLink>
        </Card>
      </Container>
    </>
  );
}

function RuleCard({ title, icon, items }: { title: string; icon: React.ReactNode; items: string[] }) {
  return (
    <Card tone="bg" className="flex flex-col gap-3.5 p-[22px]">
      <strong className="flex items-center gap-2 font-display text-lg">
        {icon}
        {title}
      </strong>
      {items.map((w) => (
        <span key={w} className="text-[15px] leading-normal">
          {w}
        </span>
      ))}
    </Card>
  );
}
