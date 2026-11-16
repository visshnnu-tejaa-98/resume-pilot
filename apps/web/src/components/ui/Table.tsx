import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/** Bordered, horizontally scrollable table shell. */
export function Table({ minWidth = 600, className, ...rest }: ComponentProps<"table"> & { minWidth?: number }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className={cn("w-full border-collapse text-[15px]", className)} style={{ minWidth }} {...rest} />
    </div>
  );
}

export function THead({ className, ...rest }: ComponentProps<"thead">) {
  return <thead className={cn("bg-surface-2 text-left", className)} {...rest} />;
}

export function Th({ className, ...rest }: ComponentProps<"th">) {
  return (
    <th
      scope="col"
      className={cn("px-[18px] py-3.5 text-xs uppercase tracking-[0.06em] text-text-2", className)}
      {...rest}
    />
  );
}

export function Tr({ className, ...rest }: ComponentProps<"tr">) {
  return <tr className={cn("border-t border-border", className)} {...rest} />;
}

export function Td({ className, ...rest }: ComponentProps<"td">) {
  return <td className={cn("px-[18px] py-4", className)} {...rest} />;
}
