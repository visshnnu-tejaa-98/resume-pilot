import { applyUnsubscribe } from "@resume-pilot/services";
import type { Metadata } from "next";
import { UnsubscribePrefs } from "@/components/site/UnsubscribePrefs";
import { Container } from "@/components/site/Section";
import { Heading } from "@/components/ui/Typography";
import { getDb } from "@/server/db";

export const metadata: Metadata = { title: "Email preferences", robots: { index: false } };
export const dynamic = "force-dynamic";

const LABEL = { reminders: "reminder emails", productUpdates: "product update emails", all: "all marketing emails" } as const;

/**
 * Where the unsubscribe link in every marketing email lands (prd.md §13.5).
 * Opening it unsubscribes straight away — no sign-in — then offers the
 * individual switches. Receipts and other account emails always continue.
 */
export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t = "" } = await searchParams;
  const done = await applyUnsubscribe(getDb(), t).catch(() => null);

  return (
    <Container width="sm" className="flex flex-col items-center gap-5 py-20 text-center">
      {done ? (
        <>
          <Heading as="h1" size="md">
            You&apos;re unsubscribed
          </Heading>
          <p className="m-0 max-w-[520px] text-[15px] leading-[1.6] text-text-2">
            We won&apos;t send you {LABEL[done.scope]} any more. Emails about your account and payments (receipts, codes applied) still arrive.
          </p>
          <UnsubscribePrefs token={t} initial={{ reminders: done.prefs.reminders, productUpdates: done.prefs.productUpdates }} />
        </>
      ) : (
        <>
          <Heading as="h1" size="md">
            This link doesn&apos;t work
          </Heading>
          <p className="m-0 max-w-[520px] text-[15px] leading-[1.6] text-text-2">
            It may have been copied incompletely. You can change your email choices any time in Settings → Notifications after signing in.
          </p>
        </>
      )}
    </Container>
  );
}
