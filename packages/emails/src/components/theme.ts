/** Colours from design/screens/Email*.dc.html (light + dark variants). */
export interface EmailTheme {
  outer: string;
  card: string;
  soft: string;
  text: string;
  text2: string;
  muted: string;
  border: string;
  borderStrong: string;
  accent: string;
  onAccent: string;
  accentText: string;
  accentTint: string;
  accentLine: string;
  link: string;
  navy: string;
  good: string;
  goodBg: string;
  warn: string;
  warnBg: string;
  warnLine: string;
  crit: string;
  critBg: string;
  info: string;
  infoBg: string;
}

const light: EmailTheme = {
  outer: "#E9EDF2",
  card: "#FFFFFF",
  soft: "#F4F6F8",
  text: "#0F1B2A",
  text2: "#4B5A6B",
  muted: "#5E6E80",
  border: "#D6DDE6",
  borderStrong: "#9AA8B8",
  accent: "#FF9900",
  onAccent: "#0F1B2A",
  accentText: "#A85E00",
  accentTint: "#FFF4E2",
  accentLine: "#C77700",
  link: "#0A6BCB",
  navy: "#0F1B2A",
  good: "#1B7A43",
  goodBg: "#E3F4EA",
  warn: "#8F4D00",
  warnBg: "#FFF1DC",
  warnLine: "#F2CF98",
  crit: "#B42318",
  critBg: "#FDECEA",
  info: "#0A62BA",
  infoBg: "#E6F0FB",
};

const dark: EmailTheme = {
  outer: "#05090E",
  card: "#111B27",
  soft: "#1A2636",
  text: "#E8EEF5",
  text2: "#A3B3C5",
  muted: "#8193A8",
  border: "#26364A",
  borderStrong: "#4A5F78",
  accent: "#FF9F1C",
  onAccent: "#0A1119",
  accentText: "#FFB547",
  accentTint: "#2E2210",
  accentLine: "#C9801C",
  link: "#5AABFF",
  navy: "#060B12",
  good: "#4CC38A",
  goodBg: "#10291C",
  warn: "#F5B54A",
  warnBg: "#30220C",
  warnLine: "#5E4216",
  crit: "#FF8A7E",
  critBg: "#341311",
  info: "#6FB5FF",
  infoBg: "#0E2339",
};

export function emailTheme(dark_: boolean): EmailTheme {
  return dark_ ? dark : light;
}

export const FONT_SANS = "Inter, Arial, sans-serif";
export const FONT_DISPLAY = "'Space Grotesk', Arial, sans-serif";
export const FONT_MONO = "'JetBrains Mono', Menlo, Consolas, monospace";

/** en-IN thousands separators, e.g. 10,000. */
export const fmtNum = (n: number) => n.toLocaleString("en-IN");
