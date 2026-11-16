import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Source_Serif_4, Space_Grotesk } from "next/font/google";
import { ThemeSync } from "@/components/theme/ThemeSync";
import { themeBootScript } from "@/stores/theme-store";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-space-grotesk",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-jetbrains-mono",
});

/** Resume template body/heading face (Classic, Professional). */
const sourceSerif = Source_Serif_4({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-source-serif" });

export const metadata: Metadata = {
  title: { default: "Resume Pilot", template: "%s · Resume Pilot" },
  description: "One Resume. Every Opportunity. Tailored with AI.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // No `appearance` prop: the app renders fully custom UI against
    // Clerk's headless hooks (useSignIn/useSignUp) — see
    // app/sign-in/page.tsx and app/sign-up/page.tsx — so there's no
    // Clerk-rendered component left to theme. ClerkProvider is still
    // required: it's what makes the hooks and `auth()` work at all.
    <ClerkProvider>
      {/* suppressHydrationWarning: browser extensions inject attributes
          into <html>/<body> before React hydrates, and the theme boot
          script sets data-theme on <html>. It only silences attribute
          mismatches on these two elements, never on their children. */}
      <html
        lang="en"
        className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} ${sourceSerif.variable}`}
        suppressHydrationWarning
      >
        <head>
          <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        </head>
        <body className="font-sans antialiased" suppressHydrationWarning>
          <ThemeSync />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
