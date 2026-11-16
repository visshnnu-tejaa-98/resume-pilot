"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

/** Copy / native-share buttons for the referral code. */
export function ShareCode({ code, link }: { code: string; link: string }) {
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked; the code is visible to copy by hand */
    }
  }

  async function share() {
    try {
      await navigator.share({ title: "Resume Pilot", text: `Use my code ${code} when you sign up for Resume Pilot.`, url: link });
    } catch {
      /* dismissed */
    }
  }

  return (
    <div className="relative flex flex-wrap gap-2.5">
      <Button variant="brand" className="h-[46px] gap-2 px-5" onClick={copy} aria-live="polite">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
          <path d={copied ? "M5 12l5 5 9-10" : "M9 9h10v10H9zM5 15V5h10"} />
        </svg>
        {copied ? "Copied" : "Copy code"}
      </Button>
      {canShare ? (
        <Button variant="outline-hero" className="h-[46px] px-[18px]" onClick={share}>
          Share
        </Button>
      ) : null}
    </div>
  );
}
