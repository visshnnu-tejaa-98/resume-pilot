import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ContactForm } from "@/components/marketing/ContactForm";
import { Container, Split } from "@/components/site/Section";
import { CardIcon, ClockIcon, MailIcon } from "@/components/ui/icons";
import { Eyebrow, Heading } from "@/components/ui/Typography";
import { cn } from "@/lib/cn";
import { SUPPORT_EMAIL } from "@/lib/routes";

export const metadata: Metadata = { title: "Contact" };

function InfoCard({ icon, title, children, tone = "surface" }: { icon: ReactNode; title: string; children: ReactNode; tone?: "surface" | "accent" }) {
  return (
    <div
      className={cn(
        "flex gap-3.5 rounded-xl border p-5",
        tone === "accent" ? "border-warn-line bg-accent-tint" : "border-border bg-surface",
      )}
    >
      <span className={cn("flex-none", tone === "accent" ? "text-accent-text" : "text-link")}>{icon}</span>
      <div className="flex flex-col gap-1">
        <strong className="text-[15px]">{title}</strong>
        <span className="text-[15px] leading-normal text-text-2">{children}</span>
      </div>
    </div>
  );
}

/** design/screens/Contact.dc.html */
export default function ContactPage() {
  return (
    <Container width="md" className="pt-20 pb-24">
      <Split min={380} className="items-start gap-12">
        <div className="flex flex-col gap-[22px]">
          <Eyebrow>Contact</Eyebrow>
          <Heading as="h1" size="md">
            How can we help?
          </Heading>
          <p className="m-0 max-w-[460px] text-lg leading-[1.65] text-text-2">
            Questions about credits, a payment, or a resume that didn&apos;t extract well? Send us a message.
          </p>
          <div className="mt-2 flex flex-col gap-3">
            <InfoCard icon={<MailIcon />} title="Email">
              {SUPPORT_EMAIL}
            </InfoCard>
            <InfoCard icon={<ClockIcon />} title="Response time">
              [RESPONSE TIME, e.g. within 1 business day]
            </InfoCard>
            <InfoCard icon={<CardIcon />} title="Payment issue?" tone="accent">
              Include your Razorpay payment ID (starts with pay_) so we can find it quickly.
            </InfoCard>
          </div>
        </div>
        <ContactForm />
      </Split>
    </Container>
  );
}
