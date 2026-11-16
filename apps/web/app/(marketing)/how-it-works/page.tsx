import type { Metadata } from "next";
import type { ReactNode } from "react";
import {
  ConfirmMock,
  DropzoneMock,
  JobMock,
  ReviewMock,
  ScoreMock,
} from "@/components/marketing/HowItWorksMocks";
import { StopDot } from "@/components/site/RouteDecor";
import { Band, Container, Split } from "@/components/site/Section";
import { ButtonLink } from "@/components/ui/Button";
import { Table, Td, THead, Tr } from "@/components/ui/Table";
import { Eyebrow, Heading, Lead, MonoKicker } from "@/components/ui/Typography";
import { routes } from "@/lib/routes";
import { aiRules, flightRoute, PAID_STOP } from "@/content/marketing";

export const metadata: Metadata = { title: "How it works" };

interface StopProps {
  id: string;
  kicker: string;
  title: string;
  body: string;
  visual: ReactNode;
  /** Visual on the left instead of the right. */
  flip?: boolean;
  last?: boolean;
}

function Stop({ id, kicker, title, body, visual, flip, last }: StopProps) {
  const copy = (
    <div className="flex flex-col gap-3.5">
      <MonoKicker>{kicker}</MonoKicker>
      <Heading>{title}</Heading>
      <Lead>{body}</Lead>
    </div>
  );
  return (
    <Container id={id} className={last ? "scroll-mt-6 pt-[88px] pb-24" : "scroll-mt-6 pt-[88px]"}>
      <Split min={440} className="gap-14">
        {flip ? visual : copy}
        {flip ? copy : visual}
      </Split>
    </Container>
  );
}

/** design/screens/HowItWorks.dc.html */
export default function HowItWorksPage() {
  return (
    <>
      <section className="bg-hero text-on-hero">
        <Container className="flex flex-col gap-7 py-20">
          <Eyebrow tone="hero">How it works</Eyebrow>
          <Heading as="h1" size="lg" className="max-w-[860px]">
            Five stops from the resume you have to the one the job wants.
          </Heading>
          <nav
            aria-label="Steps"
            className="grid max-w-[980px] gap-3"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(150px, 100%), 1fr))" }}
          >
            {flightRoute.map((r, i) => (
              <a key={r.id} href={`#${r.id}`} className="flex flex-col gap-2.5 text-on-hero no-underline">
                <StopDot n={i + 1} size="sm" surface="hero" highlight={i === PAID_STOP} last={i === flightRoute.length - 1} />
                <span className="text-[15px] font-semibold">{r.short}</span>
              </a>
            ))}
          </nav>
        </Container>
      </section>

      <Stop
        id="upload"
        kicker="STOP 01 · FREE"
        title="Upload the resume you already have"
        body="PDF, Word, LaTeX source or a photo. Scanned pages are read with OCR. Up to 10 MB and 5 pages. You don't need to compile LaTeX or retype anything."
        visual={<DropzoneMock />}
      />
      <Stop
        id="review"
        flip
        kicker="STOP 02 · FREE"
        title="Check what we read"
        body="Your resume becomes structured sections you can edit. Anything we weren't sure about, like a missing month or an unclear company name, is highlighted so you can fix it before tailoring."
        visual={<ReviewMock />}
      />
      <Stop
        id="job"
        kicker="STOP 03 · FREE"
        title="Paste the job description"
        body="Paste the full posting, up to 30,000 characters, and add the company and role if you like. Saved jobs can be reused for more versions or scores."
        visual={<JobMock />}
      />
      <Stop
        id="generate"
        flip
        kicker="STOP 04 · CREDITS"
        title="Confirm, then generate"
        body="After you click Proceed, you see exactly what will run and the most it can cost. Nothing is charged until you confirm. We tailor your summary, bullets, skills order and projects to the role, then check every fact against your original."
        visual={<ConfirmMock />}
      />
      <Stop
        id="score"
        last
        kicker="STOP 05 · SCORING USES CREDITS"
        title="Score, polish, download"
        body="Run an ATS score whenever you're ready, then edit anything by hand in the side-by-side editor. Edited the resume? Re-score it. Pick one of five ATS-friendly templates and download a PDF. Editing, templates and downloads are free."
        visual={<ScoreMock />}
      />

      <Band>
        <Container width="sm" className="flex flex-col gap-6 py-20">
          <Heading>What the AI can and can&apos;t change</Heading>
          <Table minWidth={600}>
            <THead>
              <tr>
                <th scope="col" className="w-1/2 px-[18px] py-3.5 text-good">Allowed</th>
                <th scope="col" className="px-[18px] py-3.5 text-text-2">Never allowed</th>
              </tr>
            </THead>
            <tbody>
              {aiRules.map((r) => (
                <Tr key={r.yes}>
                  <Td className="py-3.5">{r.yes}</Td>
                  <Td className="py-3.5">{r.no}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          <p className="m-0 text-[15px] leading-[1.6] text-text-2">
            Instructions hidden inside a job post or resume are treated as text, never followed. Manual edits you make
            yourself are always accepted.
          </p>
        </Container>
      </Band>

      <Container className="flex flex-wrap items-center justify-between gap-5 py-20">
        <Heading className="text-[32px]">Ready for stop one?</Heading>
        <ButtonLink href={routes.signUp} size="xl">
          Upload your resume free
        </ButtonLink>
      </Container>
    </>
  );
}
