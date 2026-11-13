"use client";

import { useClerk, useUser } from "@clerk/nextjs";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@resume-pilot/trpc";
import Link from "next/link";
import { useEffect, useState } from "react";
import * as styles from "@/components/auth-styles";

const client = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: "/api/trpc" })],
});

export default function Home() {
  const [status, setStatus] = useState("checking...");
  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut } = useClerk();

  useEffect(() => {
    client.health
      .query()
      .then((res) => setStatus(res.status))
      .catch(() => setStatus("error"));
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-3xl font-semibold">Resume Pilot</h1>
      <p style={{ color: "var(--color-text-secondary)" }}>
        One Resume. Every Opportunity. Tailored with AI.
      </p>
      <p className="font-mono text-sm">tRPC health: {status}</p>

      {isLoaded && (
        <div className="mt-4 flex flex-col items-center gap-3">
          {isSignedIn ? (
            <>
              <p style={{ color: "var(--color-text-secondary)" }}>
                Signed in as {user.primaryEmailAddress?.emailAddress}
              </p>
              <div className="flex gap-3">
                <Link
                  href="/dashboard"
                  style={{ ...styles.primaryButton, width: "auto", padding: "0 20px" }}
                >
                  Dashboard
                </Link>
                <button
                  type="button"
                  onClick={() => signOut({ redirectUrl: "/" })}
                  style={{ ...styles.oauthButton, width: "auto", padding: "0 20px" }}
                >
                  Log out
                </button>
              </div>
            </>
          ) : (
            <div className="flex gap-3">
              <Link
                href="/sign-in"
                style={{ ...styles.oauthButton, width: "auto", padding: "0 20px" }}
              >
                Sign in
              </Link>
              <Link
                href="/sign-up"
                style={{ ...styles.primaryButton, width: "auto", padding: "0 20px" }}
              >
                Sign up
              </Link>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
