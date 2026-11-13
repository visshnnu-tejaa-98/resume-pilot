import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Resume Pilot",
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
      <html lang="en" className={inter.variable}>
        <body style={{ fontFamily: "var(--font-inter), system-ui, sans-serif" }}>{children}</body>
      </html>
    </ClerkProvider>
  );
}
