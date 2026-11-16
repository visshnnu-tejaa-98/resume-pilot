import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WelcomeEmail } from "./templates/Welcome";

const sendMail = vi.fn();

vi.mock("nodemailer", () => ({
  default: { createTransport: () => ({ sendMail }) },
}));

describe("sendEmail", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    sendMail.mockReset();
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_PORT = "587";
    process.env.SMTP_USER = "user";
    process.env.SMTP_PASSWORD = "pass";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it("renders html and text and sends via the SMTP transport", async () => {
    sendMail.mockResolvedValue({ messageId: "msg-1" });
    const { sendEmail } = await import("./send");

    const result = await sendEmail({
      to: "asha@example.com",
      subject: "Welcome to Resume Pilot, Asha",
      element: WelcomeEmail({
        firstName: "Asha",
        launchCoupon: { code: "EARLYBIRD", credits: 500 },
        referralCredits: 100,
        uploadUrl: "https://app.resumepilot.app/dashboard",
        walletUrl: "https://app.resumepilot.app/dashboard",
      }),
    });

    expect(result.messageId).toBe("msg-1");
    expect(sendMail).toHaveBeenCalledTimes(1);
    const call = sendMail.mock.calls[0]?.[0];
    expect(call.to).toBe("asha@example.com");
    expect(call.html).toContain("Asha");
    expect(call.text).toContain("Asha");
  });

  it("throws clearly when SMTP env vars are missing", async () => {
    delete process.env.SMTP_HOST;
    const { sendEmail } = await import("./send");

    await expect(
      sendEmail({
        to: "asha@example.com",
        subject: "x",
        element: WelcomeEmail({
          firstName: "Asha",
          launchCoupon: null,
          referralCredits: 100,
          uploadUrl: "https://app.resumepilot.app/dashboard",
          walletUrl: "https://app.resumepilot.app/dashboard",
        }),
      }),
    ).rejects.toThrow(/SMTP is not configured/);
  });
});

describe("smtpOptionsFromEnv", () => {
  const base = { SMTP_HOST: "smtp.example.com", SMTP_USER: "u", SMTP_PASSWORD: "p" };

  it("port 587 uses STARTTLS and requires it, never plaintext", async () => {
    const { smtpOptionsFromEnv } = await import("./send");
    const opts = smtpOptionsFromEnv({ ...base, SMTP_PORT: "587" });
    expect(opts).toMatchObject({ port: 587, secure: false, requireTLS: true });
  });

  it("port 465 uses implicit TLS", async () => {
    const { smtpOptionsFromEnv } = await import("./send");
    const opts = smtpOptionsFromEnv({ ...base, SMTP_PORT: "465" });
    expect(opts).toMatchObject({ port: 465, secure: true, requireTLS: false });
  });

  it("sets timeouts well below a webhook timeout", async () => {
    const { smtpOptionsFromEnv } = await import("./send");
    const opts = smtpOptionsFromEnv({ ...base, SMTP_PORT: "587" });
    expect(opts.connectionTimeout).toBeLessThanOrEqual(10_000);
    expect(opts.greetingTimeout).toBeLessThanOrEqual(10_000);
    expect(opts.socketTimeout).toBeLessThanOrEqual(20_000);
  });

  it.each(["abc", "0", "70000", "58.7"])("rejects invalid SMTP_PORT %s", async (port) => {
    const { smtpOptionsFromEnv } = await import("./send");
    expect(() => smtpOptionsFromEnv({ ...base, SMTP_PORT: port })).toThrow(/valid port/);
  });

  it.each(["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD"])(
    "throws when %s is missing",
    async (key) => {
      const { smtpOptionsFromEnv } = await import("./send");
      const env: Record<string, string> = { ...base, SMTP_PORT: "587" };
      delete env[key];
      expect(() => smtpOptionsFromEnv(env)).toThrow(/SMTP is not configured/);
    },
  );
});
