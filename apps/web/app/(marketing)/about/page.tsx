import type { Metadata } from "next";
import { RouteCurve } from "@/components/site/RouteDecor";
import { AutoGrid, Band, Container, Split } from "@/components/site/Section";
import { ButtonLink, TextLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CheckItem } from "@/components/ui/CheckItem";
import { Eyebrow, Heading, Lead } from "@/components/ui/Typography";
import { routes } from "@/lib/routes";
import { aboutData, aboutValues } from "@/content/marketing";

export const metadata: Metadata = { title: "About" };

/** design/screens/About.dc.html */
export default function AboutPage() {
  return (
    <>
      <Container width="sm" className="flex flex-col gap-[22px] pt-24 pb-16">
        <Eyebrow>About Resume Pilot</Eyebrow>
        <Heading as="h1" size="xl">
          Built for job seekers tired of rewriting the same resume for every application.
        </Heading>
        <p className="m-0 max-w-[780px] text-[19px] leading-[1.7] text-text-2">
          Every job asks for something slightly different. Tailoring by hand takes hours, and most AI tools solve it by
          making things up. We built Resume Pilot to do the tailoring for you while keeping every fact exactly as you
          wrote it.
        </p>
      </Container>

      <Container width="sm" className="pb-20">
        <Card tone="hero" className="flex flex-col gap-3.5 rounded-[18px] p-12 max-sm:p-7">
          <RouteCurve
            width={520}
            height={200}
            d="M0 190 C 150 190, 220 60, 360 70 S 500 30, 520 14"
            className="-right-10 -bottom-10 opacity-50"
          />
          <Eyebrow tone="hero" className="relative">Our principle</Eyebrow>
          <p className="relative m-0 max-w-[820px] font-display text-[clamp(24px,3vw,34px)] leading-[1.3]">
            Preserve the candidate&apos;s original experience, create a separate version for every job, and charge only
            for work that succeeds.
          </p>
        </Card>
      </Container>

      <Container width="sm" className="flex flex-col gap-7 pb-[88px]">
        <Heading>What we stand by</Heading>
        <AutoGrid min={300} className="gap-5">
          {aboutValues.map((v) => (
            <Card key={v.n} radius="lg" className="flex flex-col gap-3 p-7">
              <span className="font-mono text-[13px] font-semibold text-accent-text">{v.n}</span>
              <h3 className="m-0 font-display text-[22px] font-bold">{v.title}</h3>
              <p className="m-0 text-base leading-[1.65] text-text-2">{v.body}</p>
            </Card>
          ))}
        </AutoGrid>
      </Container>

      <Band>
        <Container width="sm">
          <Split min={420} className="items-start gap-12 py-20">
            <div className="flex flex-col gap-3.5">
              <Heading>Your data, your call</Heading>
              <Lead>Your resume is personal. We treat it that way.</Lead>
              <TextLink href={routes.privacy} className="self-start underline">
                Read the privacy policy
              </TextLink>
            </div>
            <div className="flex flex-col gap-3.5">
              {aboutData.map((d) => (
                <CheckItem key={d} size={20} className="gap-3 text-base leading-[1.55] [&>svg]:mt-0.5">
                  {d}
                </CheckItem>
              ))}
            </div>
          </Split>
        </Container>
      </Band>

      <Container width="sm" className="flex flex-wrap items-center justify-between gap-5 py-20">
        <div className="flex flex-col gap-2">
          <Heading className="text-[30px]">Have feedback or a partnership idea?</Heading>
          <span className="text-base text-text-2">We read every message.</span>
        </div>
        <ButtonLink href={routes.contact} variant="outline" size="lg">
          Contact us
        </ButtonLink>
      </Container>
    </>
  );
}
