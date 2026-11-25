import { forwardRef, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type FieldSize = "sm" | "md";

const control = (size: FieldSize, invalid?: boolean) =>
  cn(
    "box-border w-full rounded-md bg-input-bg font-normal text-text outline-none focus-visible:border-link focus-visible:ring-2 focus-visible:ring-link/30",
    size === "sm" ? "text-sm" : "text-[15px]",
    invalid ? "border-2 border-crit" : "border border-border-strong",
  );

interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  /** Right-aligned content on the label row (e.g. "Forgot password?"). */
  labelAside?: ReactNode;
  /** Helper text under the control. */
  help?: ReactNode;
  error?: string;
  className?: string;
  children: ReactNode;
  size?: FieldSize;
}

/** Label wrapping a control, with optional hint, help and error text. */
export function Field({ label, hint, labelAside, help, error, className, children, size = "md" }: FieldProps) {
  return (
    <label className={cn("flex flex-col gap-1.5 font-semibold", size === "sm" ? "text-[13px]" : "text-sm", className)}>
      <span className={labelAside ? "flex justify-between gap-3" : undefined}>
        <span>
          {label}
          {hint ? <span className="font-normal text-text-2"> {hint}</span> : null}
        </span>
        {labelAside}
      </span>
      {children}
      {help && !error ? <span className="text-[13px] font-normal text-text-2">{help}</span> : null}
      {error ? (
        <span role="alert" className="text-xs font-medium text-crit">
          {error}
        </span>
      ) : null}
    </label>
  );
}

type Sized = { fieldSize?: FieldSize; invalid?: boolean };

export const Input = forwardRef<HTMLInputElement, ComponentProps<"input"> & Sized>(function Input(
  { fieldSize = "md", invalid, className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(control(fieldSize, invalid), fieldSize === "sm" ? "h-10 px-2.5" : "h-11 px-3", className)}
      {...rest}
    />
  );
});

export const Select = forwardRef<HTMLSelectElement, ComponentProps<"select"> & Sized>(function Select(
  { fieldSize = "md", invalid, className, style, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        control(fieldSize, invalid),
        // Own chevron instead of the native arrow, which hugs the border and ignores padding.
        "cursor-pointer appearance-none bg-no-repeat",
        fieldSize === "sm" ? "h-10 pl-2.5 pr-9 bg-[position:right_12px_center]" : "h-11 pl-3 pr-10 bg-[position:right_14px_center]",
        className,
      )}
      style={{ backgroundImage: CHEVRON, backgroundSize: "14px 14px", ...style }}
      {...rest}
    />
  );
});

/** Mid-grey down chevron, readable on both light and dark inputs. */
const CHEVRON = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238a94a3' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`;

export const Textarea = forwardRef<HTMLTextAreaElement, ComponentProps<"textarea"> & Sized>(function Textarea(
  { fieldSize = "md", invalid, className, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(control(fieldSize, invalid), "leading-normal", fieldSize === "sm" ? "p-2.5" : "p-3", className)}
      {...rest}
    />
  );
});
