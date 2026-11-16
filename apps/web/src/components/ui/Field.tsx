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
  { fieldSize = "md", invalid, className, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(control(fieldSize, invalid), fieldSize === "sm" ? "h-10 px-2.5" : "h-11 px-3", className)}
      {...rest}
    />
  );
});

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
