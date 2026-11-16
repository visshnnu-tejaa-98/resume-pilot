import type { SVGProps } from "react";

type IconProps = Omit<SVGProps<SVGSVGElement>, "children" | "d"> & { size?: number };

/** Stroke icon on a 24×24 grid — the format every design screen uses. */
function Stroke({ size = 18, strokeWidth = 2, d, ...rest }: IconProps & { d: string | string[] }) {
  const paths = Array.isArray(d) ? d : [d];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {paths.map((p) => (
        <path key={p} d={p} />
      ))}
    </svg>
  );
}

export const CheckIcon = (p: IconProps) => <Stroke strokeWidth={2.6} d="M5 12l5 5 9-10" {...p} />;
export const CrossIcon = (p: IconProps) => <Stroke strokeWidth={2.6} d="M6 6l12 12M18 6 6 18" {...p} />;
export const ArrowRightIcon = (p: IconProps) => <Stroke strokeWidth={2.4} d="M5 12h14M13 6l6 6-6 6" {...p} />;
export const PlusIcon = (p: IconProps) => <Stroke strokeWidth={2.2} d="M12 5v14M5 12h14" {...p} />;
export const WarningIcon = (p: IconProps) => <Stroke d={["M12 3 2 20h20L12 3Z", "M12 10v4M12 17v.01"]} {...p} />;
export const UploadIcon = (p: IconProps) => (
  <Stroke strokeWidth={1.8} d={["M12 16V4M6 10l6-6 6 6", "M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"]} {...p} />
);
export const SearchIcon = (p: IconProps) => <Stroke strokeWidth={2.2} d={["M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z", "M20 20l-3.5-3.5"]} {...p} />;

export const MailIcon = (p: IconProps) => (
  <svg width={p.size ?? 22} height={p.size ?? 22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true" className={p.className}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 7l9 6 9-6" />
  </svg>
);
export const ClockIcon = (p: IconProps) => (
  <svg width={p.size ?? 22} height={p.size ?? 22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true" className={p.className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);
export const CardIcon = (p: IconProps) => (
  <svg width={p.size ?? 22} height={p.size ?? 22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true" className={p.className}>
    <rect x="3" y="6" width="18" height="13" rx="2" />
    <path d="M3 10h18" />
  </svg>
);
