import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant =
  /** Theme accent fill (orange, slightly brighter in dark). */
  | "primary"
  /** Fixed brand orange — for CTAs sitting on navy hero surfaces. */
  | "brand"
  /** 1px border in the text colour. */
  | "outline"
  /** Outline for navy hero surfaces. */
  | "outline-hero"
  /** Text-only link-coloured button (dialog "Cancel"). */
  | "ghost";

export type ButtonSize = "sm" | "md" | "lg" | "xl";

const base =
  "inline-flex items-center justify-center gap-2.5 rounded-md no-underline whitespace-nowrap transition-[filter,background-color] cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-on-accent font-bold hover:brightness-105",
  brand: "bg-brand text-brand-ink font-bold hover:brightness-105",
  outline: "border border-text text-text font-semibold hover:bg-surface-2",
  "outline-hero": "border border-hero-line-strong text-on-hero font-semibold hover:bg-hero-chip",
  ghost: "text-link font-semibold hover:underline",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-10 px-[18px] text-[15px]",
  md: "h-11 px-5 text-[15px]",
  lg: "h-12 px-[22px] text-base",
  xl: "h-[52px] px-[26px] text-[17px]",
};

interface StyleProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  className?: string;
  children: ReactNode;
}

export function buttonClasses({ variant = "primary", size = "md", block, className }: Omit<StyleProps, "children">) {
  return cn(base, variants[variant], sizes[size], block && "w-full", className);
}

export function Button({ variant, size, block, className, type = "button", ...rest }: StyleProps & ComponentProps<"button">) {
  return <button type={type} className={buttonClasses({ variant, size, block, className })} {...rest} />;
}

export function ButtonLink({ variant, size, block, className, ...rest }: StyleProps & ComponentProps<typeof Link>) {
  return <Link className={buttonClasses({ variant, size, block, className })} {...rest} />;
}

/** Inline text link in the theme link colour. */
export function TextLink({ className, ...rest }: ComponentProps<typeof Link>) {
  return <Link className={cn("font-semibold text-link hover:underline", className)} {...rest} />;
}
