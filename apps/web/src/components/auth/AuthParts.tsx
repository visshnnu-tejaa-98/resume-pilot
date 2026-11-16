import Link from "next/link";
import type { ReactNode } from "react";
import { GoogleIcon, LinkedInIcon } from "@/components/BrandIcons";
import { cn } from "@/lib/cn";
import { routes } from "@/lib/routes";

/** "Sign in" / "Create your account" title + subline. */
export function AuthHeading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="m-0 font-display text-[30px] font-bold tracking-[-0.01em]">{title}</h2>
      {children ? <span className="text-[15px] text-text-2">{children}</span> : null}
    </div>
  );
}

export type OAuthStrategy = "oauth_google" | "oauth_linkedin_oidc";

const providers: { strategy: OAuthStrategy; name: string; Icon: () => ReactNode }[] = [
  { strategy: "oauth_google", name: "Google", Icon: GoogleIcon },
  { strategy: "oauth_linkedin_oidc", name: "LinkedIn", Icon: LinkedInIcon },
];

interface OAuthButtonsProps {
  onSelect: (strategy: OAuthStrategy) => void;
  /** `stack` = full-width "Continue with X" rows (sign-in); `grid` = side by side (sign-up). */
  layout?: "stack" | "grid";
  disabled?: boolean;
}

export function OAuthButtons({ onSelect, layout = "stack", disabled }: OAuthButtonsProps) {
  return (
    <div
      className={cn(layout === "stack" ? "flex flex-col gap-2.5" : "grid gap-2.5")}
      style={layout === "grid" ? { gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))" } : undefined}
    >
      {providers.map(({ strategy, name, Icon }) => (
        <button
          key={strategy}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(strategy)}
          className="flex h-12 cursor-pointer items-center justify-center gap-2.5 rounded-md border border-border-strong bg-surface text-[15px] font-semibold text-text hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Icon />
          {layout === "stack" ? `Continue with ${name}` : name}
        </button>
      ))}
    </div>
  );
}

export function OrDivider({ label = "or with email" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-[13px] text-text-2">
      <span className="h-px flex-1 bg-border" />
      {label}
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

export function FormError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="m-0 rounded-md border border-crit-line bg-crit-bg px-3 py-2.5 text-sm text-crit">
      {children}
    </p>
  );
}

/** Terms + Privacy links, reused in the consent lines. */
export function LegalLinks() {
  return (
    <>
      <Link href={routes.terms} className="text-link underline">
        Terms
      </Link>{" "}
      and{" "}
      <Link href={routes.privacy} className="text-link underline">
        Privacy policy
      </Link>
    </>
  );
}
