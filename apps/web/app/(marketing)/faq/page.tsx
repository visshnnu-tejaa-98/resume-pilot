import type { Metadata } from "next";
import { SectionNav } from "@/components/marketing/SectionNav";
import { CtaBar } from "@/components/site/CtaBar";
import { Container } from "@/components/site/Section";
import { ButtonLink } from "@/components/ui/Button";
import { Eyebrow, Heading } from "@/components/ui/Typography";
import { cn } from "@/lib/cn";
import { routes } from "@/lib/routes";
import { faqGroups } from "@/content/faq";

export const metadata: Metadata = { title: "FAQ" };

/** design/screens/FAQ.dc.html */
export default function FaqPage() {
  return (
    <>
      <Container width="md" className="flex flex-col gap-4 pt-20 pb-10">
        <Eyebrow>FAQ</Eyebrow>
        <Heading as="h1" size="md">
          Questions, answered.
        </Heading>
      </Container>

      <Container width="md" className="flex flex-wrap items-start gap-10 pb-24">
        <SectionNav label="FAQ topics" items={faqGroups} />
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-10">
          {faqGroups.map((g, gi) => (
            <div key={g.id} id={g.id} className="flex scroll-mt-6 flex-col gap-3.5">
              <h2 className="m-0 font-display text-2xl font-bold">{g.title}</h2>
              <div className="overflow-hidden rounded-xl border border-border bg-surface">
                {g.items.map((q, i) => (
                  <details key={q.q} open={gi === 0 && i === 0} className={cn(i > 0 && "border-t border-border")}>
                    <summary className="cursor-pointer px-[22px] py-[18px] text-base font-semibold">{q.q}</summary>
                    <p className="m-0 px-[22px] pb-5 text-[15px] leading-[1.65] text-text-2">{q.a}</p>
                  </details>
                ))}
              </div>
            </div>
          ))}
          <CtaBar
            tone="hero"
            title="Still stuck?"
            action={
              <ButtonLink href={routes.contact} variant="brand" size="md">
                Contact support
              </ButtonLink>
            }
          />
        </div>
      </Container>
    </>
  );
}
