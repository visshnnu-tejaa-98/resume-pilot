import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * prd.md §15: secrets live in env only, and server-only secrets (ImageKit
 * private key, Clerk/Razorpay/OpenAI/SMTP secrets) never reach a client
 * bundle. Static checks over the source, plus a scan of the built client
 * assets when a production build exists (CI builds before testing).
 */

const ROOT = join(import.meta.dirname, "../../../..");
const WEB = join(ROOT, "apps/web");

/** Server-only env vars: must never be read in client code or exposed as NEXT_PUBLIC_*. */
const SERVER_SECRETS = [
  "IMAGEKIT_PRIVATE_KEY",
  "CLERK_SECRET_KEY",
  "CLERK_WEBHOOK_SECRET",
  "RAZORPAY_KEY_SECRET",
  "RAZORPAY_WEBHOOK_SECRET",
  "OPENAI_API_KEY",
  "SMTP_PASSWORD",
  "EMAIL_UNSUBSCRIBE_SECRET",
  "ABUSE_HASH_SALT",
  "DATABASE_URL",
  "REDIS_URL",
];

/** Packages that hold server credentials or open server connections. */
const SERVER_ONLY_IMPORTS = ["@resume-pilot/storage", "@resume-pilot/database", "@resume-pilot/services", "@resume-pilot/queue", "@resume-pilot/emails/send", "imagekit", "@imagekit/nodejs", "openai", "razorpay", "nodemailer", "pg", "postgres", "ioredis", "bullmq"];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?|mjs)$/.test(name)) out.push(p);
  }
  return out;
}

const webFiles = [...walk(join(WEB, "app")), ...walk(join(WEB, "src"))].filter((f) => !/\.test\.tsx?$/.test(f));
const clientFiles = webFiles.filter((f) => /^\s*["']use client["']/m.test(readFileSync(f, "utf8").slice(0, 400)));

describe("client components never touch server secrets", () => {
  it("finds client components to check", () => {
    expect(clientFiles.length).toBeGreaterThan(10);
  });

  it("no client component reads a server-only env var", () => {
    const hits = clientFiles.flatMap((f) => {
      const src = readFileSync(f, "utf8");
      return SERVER_SECRETS.filter((k) => src.includes(k)).map((k) => `${relative(ROOT, f)}: ${k}`);
    });
    expect(hits).toEqual([]);
  });

  it("no client component imports a server-only package", () => {
    const hits = clientFiles.flatMap((f) => {
      const src = readFileSync(f, "utf8");
      return SERVER_ONLY_IMPORTS.filter((m) => new RegExp(`from\\s+["']${m.replace(/[/.]/g, "\\$&")}["']`).test(src)).map((m) => `${relative(ROOT, f)}: ${m}`);
    });
    expect(hits).toEqual([]);
  });

  it("no secret is exposed under a NEXT_PUBLIC_ name", () => {
    const hits = webFiles.flatMap((f) => {
      const src = readFileSync(f, "utf8");
      return [...src.matchAll(/NEXT_PUBLIC_[A-Z0-9_]*(SECRET|PRIVATE|PASSWORD|TOKEN|API_KEY|SALT)[A-Z0-9_]*/g)].map((m) => `${relative(ROOT, f)}: ${m[0]}`);
    });
    expect(hits).toEqual([]);
  });

  it("next.config doesn't pass server secrets to the client via `env`", () => {
    const cfg = ["next.config.ts", "next.config.mjs", "next.config.js"].map((n) => join(WEB, n)).find(existsSync);
    if (!cfg) return;
    const src = readFileSync(cfg, "utf8");
    for (const k of SERVER_SECRETS) expect(src.includes(k), `${k} in next.config`).toBe(false);
  });
});

describe("no secret values are committed", () => {
  const tracked = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter((f) => f && !/(^|\/)(pnpm-lock\.yaml|.*\.(png|jpe?g|pdf|woff2?|ico|lock))$/.test(f));

  it("no .env file with values is tracked (only .env.example)", () => {
    expect(tracked.filter((f) => /(^|\/)\.env(\.[^/]*)?$/.test(f) && !f.endsWith(".env.example"))).toEqual([]);
  });

  const PATTERNS: [string, RegExp][] = [
    ["OpenAI key", /sk-(proj-)?[A-Za-z0-9_-]{32,}/],
    ["Razorpay live key", /rzp_live_[A-Za-z0-9]{10,}/],
    ["Clerk live secret", /sk_live_[A-Za-z0-9]{20,}/],
    ["ImageKit private key", /private_[A-Za-z0-9+/=]{20,}/],
    ["Private key block", /-----BEGIN (RSA |EC )?PRIVATE KEY-----/],
  ];

  it("no tracked file contains a real-looking secret", () => {
    const hits: string[] = [];
    for (const f of tracked) {
      const p = join(ROOT, f);
      if (!existsSync(p) || statSync(p).size > 2_000_000) continue;
      const src = readFileSync(p, "utf8");
      for (const [name, re] of PATTERNS) if (re.test(src)) hits.push(`${f}: ${name}`);
    }
    expect(hits).toEqual([]);
  });

  it("every .env.example leaves secrets blank", () => {
    for (const f of tracked.filter((x) => x.endsWith(".env.example"))) {
      const lines = readFileSync(join(ROOT, f), "utf8").split("\n");
      for (const k of SERVER_SECRETS.filter((s) => s !== "DATABASE_URL" && s !== "REDIS_URL")) {
        const line = lines.find((l) => l.startsWith(`${k}=`));
        if (line) expect(line, `${f}: ${k}`).toBe(`${k}=`);
      }
    }
  });
});

describe.skipIf(!existsSync(join(WEB, ".next/static")))("built client assets (after `next build`)", () => {
  it("contain none of the server secret values from the environment", () => {
    const values = SERVER_SECRETS.map((k) => process.env[k]).filter((v): v is string => !!v && v.length >= 12);
    const files: string[] = [];
    const scan = (d: string) => {
      for (const n of readdirSync(d)) {
        const p = join(d, n);
        if (statSync(p).isDirectory()) scan(p);
        else if (n.endsWith(".js")) files.push(p);
      }
    };
    scan(join(WEB, ".next/static"));
    const hits = files.filter((f) => {
      const src = readFileSync(f, "utf8");
      return values.some((v) => src.includes(v));
    });
    expect(hits.map((f) => relative(WEB, f))).toEqual([]);
  });
});
