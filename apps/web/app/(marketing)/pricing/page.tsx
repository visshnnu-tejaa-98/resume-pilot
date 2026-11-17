import { listActiveCreditPackages, typicalCreditsPerAction } from "@resume-pilot/services";
import type { Metadata } from "next";
import { LaunchOfferCard } from "@/components/marketing/TopUpCard";
import { CtaBar } from "@/components/site/CtaBar";
import { RouteCurve, StopDot } from "@/components/site/RouteDecor";
import { AutoGrid, Band, Container } from "@/components/site/Section";
import { ButtonLink, TextLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CheckItem } from "@/components/ui/CheckItem";
import { Table, Td, Th, THead, Tr } from "@/components/ui/Table";
import { Eyebrow, Heading } from "@/components/ui/Typography";
import { routes } from "@/lib/routes";
import { pricing } from "@/content/marketing";
import { fmtCredits, fmtInr } from "@/lib/format";
import { getDb } from "@/server/db";

export const metadata: Metadata = { title: "Pricing" };

// Packs are admin config (credit_packages): read per request so an added or disabled pack shows without a deploy.
export const dynamic = "force-dynamic";

/** design/screens/Pricing.dc.html */
export default async function PricingPage() {
  const [packs, typical] = await Promise.all([
    listActiveCreditPackages(getDb()).catch(() => []),
    // Measured medians only (prd.md §3.6); missing until enough real runs exist.
    typicalCreditsPerAction(getDb()).catch(() => ({}) as Record<string, number>),
  ]);
  const measured = Object.keys(typical).length > 0;
  const lead = packs[0];
  return (
    <>
      <Container className="flex flex-col items-center gap-4 pt-20 pb-12 text-center">
        <Eyebrow>Pricing</Eyebrow>
        <Heading as="h1" size="lg" className="max-w-[820px]">
          Pay for what you use. Nothing else.
        </Heading>
        <p className="m-0 max-w-[640px] text-lg leading-[1.6] text-text-2">
          No subscription, no monthly fee. Add money to your wallet, get credits, and spend them on AI actions. Credits
          never expire.
        </p>
      </Container>

      <Container width="sm" className="pb-[72px]">
        <AutoGrid min={320} className="gap-5">
          <Card tone="hero" radius="xl" className="flex flex-col gap-[18px] p-9">
            <RouteCurve
              width={300}
              height={120}
              d="M0 110 C 90 110, 140 30, 220 34 S 290 14, 300 8"
              dash="7 9"
              className="top-2.5 -right-2.5 opacity-50"
            />
            <span className="relative text-sm font-semibold text-on-hero-3">Wallet top-up</span>
            <div className="relative flex flex-wrap items-baseline gap-3">
              <span className="font-display text-[64px] leading-none font-bold">{lead ? fmtInr(lead.pricePaise / 100) : pricing.topUpInr}</span>
              <span className="text-[15px] text-on-hero-3">one-time</span>
            </div>
            <span className="relative font-mono text-[22px] font-semibold text-hero-accent">
              = {lead ? `${fmtCredits(lead.credits + lead.bonusCredits)} credits` : pricing.topUpCredits}
            </span>
            {packs.length > 1 ? (
              <ul className="relative m-0 flex list-none flex-col gap-1.5 p-0 text-[15px] text-on-hero-link" aria-label="Other top-up packs">
                {packs.slice(1).map((p) => (
                  <li key={p.id} className="flex justify-between gap-3 border-t border-white/10 pt-1.5">
                    <span className="font-semibold">{fmtInr(p.pricePaise / 100)}</span>
                    <span className="font-mono">
                      {fmtCredits(p.credits + p.bonusCredits)} credits{p.bonusCredits ? ` (incl. ${fmtCredits(p.bonusCredits)} bonus)` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="relative flex flex-col gap-2.5 text-[15px] text-on-hero-link">
              {pricing.perks.map((p) => (
                <CheckItem key={p} tone="hero">
                  {p}
                </CheckItem>
              ))}
            </div>
            <ButtonLink href={routes.signUp} variant="brand" size="lg" block className="relative mt-1.5 h-[50px]">
              Create account and add money
            </ButtonLink>
            <span className="relative text-xs text-on-hero-muted">Final price. No GST is charged for now; a receipt is emailed for every payment.</span>
          </Card>

          <div className="flex flex-col gap-5">
            <LaunchOfferCard size="lg" footnote="One code per account. Works at sign-up or later from your wallet.">
              New accounts start at 0 credits. Apply EARLYBIRD or a friend&apos;s referral code to get{" "}
              <strong>{pricing.launchCredits}</strong>.
            </LaunchOfferCard>
            <Card radius="xl" className="flex flex-col gap-3.5 p-7">
              <strong className="font-display text-[19px]">Always free</strong>
              <AutoGrid min={180} className="gap-x-5 gap-y-2.5 text-[15px]">
                {pricing.alwaysFree.map((f) => (
                  <CheckItem key={f} className="gap-2">
                    {f}
                  </CheckItem>
                ))}
              </AutoGrid>
            </Card>
          </div>
        </AutoGrid>
      </Container>

      <Band>
        <Container width="sm" className="flex flex-col gap-7 py-[72px]">
          <div className="flex flex-col gap-2.5">
            <Heading>What credits pay for</Heading>
            <p className="m-0 text-base text-text-2">
              Costs depend on the length of your resume and the job description. You always see the exact estimate before
              anything runs.
            </p>
          </div>
          <Table minWidth={640}>
            <THead>
              <tr>
                <Th>Action</Th>
                <Th>Typical credits</Th>
                <Th>Good to know</Th>
              </tr>
            </THead>
            <tbody>
              {pricing.actions.map((a) => (
                <Tr key={a.name}>
                  <Td className="font-semibold">{a.name}</Td>
                  <Td className="font-mono">{a.type && typical[a.type] ? `~${fmtCredits(typical[a.type]!)}` : a.cost}</Td>
                  <Td className="text-text-2">{a.note}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          <span className="text-[13px] text-text-2">
            {measured
              ? "Typical = the median actually charged over the last 30 days. Your estimate is always shown before anything runs."
              : "Typical credit numbers are published once enough real runs have been measured."}
          </span>
        </Container>
      </Band>

      <Container width="sm" className="flex flex-col gap-8 py-20">
        <Heading>How charging works</Heading>
        <AutoGrid min={280} className="gap-5">
          {pricing.howCharging.map((h, i) => (
            <Card key={h.title} className="flex flex-col gap-3 p-6">
              <StopDot n={i + 1} size="md" />
              <strong className="font-display text-[19px]">{h.title}</strong>
              <p className="m-0 text-[15px] leading-[1.6] text-text-2">{h.body}</p>
            </Card>
          ))}
        </AutoGrid>
        <CtaBar
          title="Questions about credits, refunds or GST?"
          action={
            <>
              <TextLink href={routes.faq} className="underline">Read the FAQ</TextLink>
              <TextLink href={routes.refunds} className="underline">Refund policy</TextLink>
            </>
          }
        />
      </Container>
    </>
  );
}
