import Link from "next/link";
import { cn } from "@/lib/cn";

/** The orange paper-plane tile. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
      <rect width="28" height="28" rx="7" fill="#FF9900" />
      <path d="M6.5 14.8 21 8l-4.6 13.2-2.7-4.9-7.2-1.5Z" fill="#0F1B2A" />
    </svg>
  );
}

interface LogoProps {
  href?: string;
  label?: string;
  size?: "md" | "lg";
  className?: string;
}

/** Mark + "ResumePilot" wordmark, for use on the navy chrome bars. */
export function Logo({ href = "/", label = "Resume Pilot home", size = "md", className }: LogoProps) {
  return (
    <Link href={href} aria-label={label} className={cn("flex items-center gap-2.5 text-on-hero no-underline", className)}>
      <LogoMark size={size === "lg" ? 30 : 28} />
      <span className={cn("font-display font-bold", size === "lg" ? "text-xl tracking-[-0.01em]" : "text-[19px]")}>
        Resume<span className="text-brand">Pilot</span>
      </span>
    </Link>
  );
}
