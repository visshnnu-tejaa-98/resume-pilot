import Link from "next/link";
import { cn } from "@/lib/cn";

export function initialsOf(name: string | null | undefined, fallback = "?"): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback;
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")).toUpperCase();
}

interface AvatarProps {
  name: string | null | undefined;
  href?: string;
  size?: 34 | 36;
  className?: string;
}

/** Initials bubble for the navy app bar. */
export function Avatar({ name, href, size = 36, className }: AvatarProps) {
  const cls = cn(
    "flex items-center justify-center rounded-full bg-hero-line text-[13px] font-semibold text-on-hero no-underline",
    size === 34 ? "size-[34px]" : "size-9",
    className,
  );
  const label = `Account: ${name ?? "you"}`;
  return href ? (
    <Link href={href} aria-label={label} className={cls}>
      {initialsOf(name)}
    </Link>
  ) : (
    <span aria-label={label} className={cls}>
      {initialsOf(name)}
    </span>
  );
}
