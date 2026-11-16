import Link from "next/link";
import { Container } from "@/components/site/Section";
import { TextLink } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Eyebrow, Heading } from "@/components/ui/Typography";
import { cn } from "@/lib/cn";
import { routes } from "@/lib/routes";
import { legalDocs, legalOrder, type LegalDocId } from "@/content/legal";

/**
 * Shared layout for /privacy, /terms and /refunds. The design's tabs are
 * real links, so each policy has its own URL (linkable from the footer,
 * checkout and emails) rather than hidden client state.
 */
export function LegalPage({ docId }: { docId: LegalDocId }) {
  const doc = legalDocs[docId];
  return (
    <>
      <section className="border-b border-border bg-surface">
        <Container width="md" className="flex flex-col gap-5 pt-14">
          <Eyebrow>Legal</Eyebrow>
          <Heading as="h1" className="text-[clamp(32px,4.5vw,46px)] tracking-[-0.02em]">
            {doc.title}
          </Heading>
          <span className="text-sm text-text-2">Last updated {doc.updated}</span>
          <nav aria-label="Legal documents" className="flex flex-wrap gap-1">
            {legalOrder.map((id) => {
              const d = legalDocs[id];
              const on = id === docId;
              return (
                <Link
                  key={id}
                  href={d.href}
                  aria-current={on ? "page" : undefined}
                  className={cn(
                    "border-b-[3px] px-4 py-3.5 text-[15px] font-semibold no-underline",
                    on ? "border-accent text-text" : "border-transparent text-text-2 hover:text-text",
                  )}
                >
                  {d.tab}
                </Link>
              );
            })}
          </nav>
        </Container>
      </section>

      <Container width="md" className="flex flex-wrap items-start gap-12 pt-12 pb-24">
        <nav aria-label="On this page" className="flex flex-[1_1_220px] flex-col gap-1.5 md:sticky md:top-6">
          <span className="mb-1.5 text-xs font-bold uppercase tracking-[0.08em] text-text-2">On this page</span>
          {doc.sections.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="py-1 text-sm text-link no-underline hover:underline">
              {s.h}
            </a>
          ))}
        </nav>
        <article className="flex min-w-0 max-w-[760px] flex-[999_1_560px] flex-col gap-8">
          <Callout tone="warn">Template only. Final wording must be drafted or reviewed by a lawyer before launch.</Callout>
          {doc.sections.map((s) => (
            <div key={s.id} id={s.id} className="flex scroll-mt-6 flex-col gap-2.5">
              <h2 className="m-0 font-display text-[22px] font-bold">{s.h}</h2>
              <p className="m-0 text-base leading-[1.75] text-text-2">{s.p}</p>
            </div>
          ))}
          <div className="border-t border-border pt-6 text-[15px] text-text-2">
            Questions about this policy? <TextLink href={routes.contact} className="underline">Contact us</TextLink>
          </div>
        </article>
      </Container>
    </>
  );
}
