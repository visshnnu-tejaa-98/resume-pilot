"use client";

import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@resume-pilot/trpc";
import { useEffect, useState } from "react";

const client = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: "/api/trpc" })],
});

export default function Home() {
  const [status, setStatus] = useState("checking...");

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
    </main>
  );
}
