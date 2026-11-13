export interface EmailTheme {
  outer: string;
  card: string;
  text: string;
  text2: string;
  border: string;
  accent: string;
  onAccent: string;
  accentTint: string;
  accentLine: string;
  navy: string;
}

const light: EmailTheme = {
  outer: "#E9EDF2",
  card: "#FFFFFF",
  text: "#0F1B2A",
  text2: "#4B5A6B",
  border: "#D6DDE6",
  accent: "#FF9900",
  onAccent: "#0F1B2A",
  accentTint: "#FFF4E2",
  accentLine: "#C77700",
  navy: "#0F1B2A",
};

const dark: EmailTheme = {
  outer: "#05090E",
  card: "#111B27",
  text: "#E8EEF5",
  text2: "#A3B3C5",
  border: "#26364A",
  accent: "#FF9F1C",
  onAccent: "#0A1119",
  accentTint: "#2E2210",
  accentLine: "#C9801C",
  navy: "#1B2A3D",
};

export function emailTheme(dark_: boolean): EmailTheme {
  return dark_ ? dark : light;
}

export const FONT_SANS = "Inter, Arial, sans-serif";
export const FONT_DISPLAY = "'Space Grotesk', Arial, sans-serif";
export const FONT_MONO = "'JetBrains Mono', monospace";
