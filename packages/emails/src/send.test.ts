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
    process.env.SES_SMTP_HOST = "smtp.example.com";
    process.env.SES_SMTP_PORT = "587";
    process.env.SES_SMTP_USER = "user";
    process.env.SES_SMTP_PASSWORD = "pass";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it("renders html and text and sends via the SES SMTP transport", async () => {
    sendMail.mockResolvedValue({ messageId: "msg-1" });
    const { sendEmail } = await import("./send");

    const result = await sendEmail({
      to: "asha@example.com",
      subject: "Welcome to Resume Pilot, Asha",
      element: WelcomeEmail({
        firstName: "Asha",
        referralCode: "EARLYBIRD",
        uploadUrl: "https://app.resumepilot.app/dashboard",
      }),
    });

    expect(result.messageId).toBe("msg-1");
    expect(sendMail).toHaveBeenCalledTimes(1);
    const call = sendMail.mock.calls[0]?.[0];
    expect(call.to).toBe("asha@example.com");
    expect(call.html).toContain("Asha");
    expect(call.text).toContain("Asha");
  });

  it("throws clearly when SES SMTP env vars are missing", async () => {
    delete process.env.SES_SMTP_HOST;
    const { sendEmail } = await import("./send");

    await expect(
      sendEmail({
        to: "asha@example.com",
        subject: "x",
        element: WelcomeEmail({
          firstName: "Asha",
          uploadUrl: "https://app.resumepilot.app/dashboard",
        }),
      }),
    ).rejects.toThrow(/SES SMTP is not configured/);
  });
});
