import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";
import { EMAIL_PREVIEWS } from "./previews";
import { CodeAppliedEmail } from "./templates/CodeApplied";
import { InactiveNudgeEmail } from "./templates/InactiveNudge";
import { NewFeaturesEmail } from "./templates/NewFeatures";
import { PaymentFailedEmail } from "./templates/PaymentFailed";
import { PaymentPendingEmail } from "./templates/PaymentPending";
import { PaymentSuccessEmail } from "./templates/PaymentSuccess";

describe("every email template", () => {
  for (const p of EMAIL_PREVIEWS) {
    it(`${p.key}: renders light + dark, email-safe, correct footer`, async () => {
      for (const dark of [false, true]) {
        const html = await render(p.render(dark));
        expect(html.length).toBeGreaterThan(1000);
        // Placeholder links and blocked image types must never ship.
        expect(html).not.toContain('href="#"');
        expect(html).not.toMatch(/<svg|src="data:/);
        if (p.kind === "marketing") expect(html).toContain("Unsubscribe");
        else expect(html).toContain("service email about your account");
      }
      const text = await render(p.render(false), { plainText: true });
      expect(text.trim().length).toBeGreaterThan(50);
      expect(p.subject.length).toBeGreaterThan(5);
    });
  }
});

describe("template content comes from props", () => {
  it("CodeApplied shows code, credits and new balance", async () => {
    const html = await render(CodeAppliedEmail({ ...CodeAppliedEmail.PreviewProps, code: "DIWALI26", credits: 1500, newBalance: 2750 }));
    expect(html).toContain("DIWALI26");
    expect(html).toContain("+1,500");
    expect(html).toContain("2,750 credits");
  });

  it("PaymentSuccess shows amount, credits, payment id; invoice button only with a URL", async () => {
    const props = { ...PaymentSuccessEmail.PreviewProps, amountPaise: 100000, credits: 21000, paymentId: "pay_TEST1" };
    const html = await render(PaymentSuccessEmail(props));
    expect(html).toContain("₹1,000.00");
    expect(html).toContain("+21,000");
    expect(html).toContain("pay_TEST1");
    expect(html).toContain("Download invoice");
    expect(await render(PaymentSuccessEmail({ ...props, invoiceUrl: null }))).not.toContain("Download invoice");
  });

  it("PaymentFailed omits the reason row when there is none", async () => {
    const html = await render(PaymentFailedEmail({ ...PaymentFailedEmail.PreviewProps, reason: null }));
    expect(html).not.toContain("Reason");
    expect(html).toContain(PaymentFailedEmail.PreviewProps.links.walletUrl);
  });

  it("PaymentPending warns not to pay twice and links to the status page", async () => {
    const html = await render(PaymentPendingEmail(PaymentPendingEmail.PreviewProps));
    expect(html).toContain("pay again");
    expect(html).toContain(PaymentPendingEmail.PreviewProps.statusUrl);
  });

  it("InactiveNudge handles no score and no pick-up hint", async () => {
    const html = await render(InactiveNudgeEmail({ ...InactiveNudgeEmail.PreviewProps, bestScore: null, pickUp: null }));
    expect(html).toContain("—");
    expect(html).not.toContain("Pick up where you left off");
    expect(html).toContain(InactiveNudgeEmail.PreviewProps.unsubscribeUrl);
  });

  it("NewFeatures renders at most three features", async () => {
    const f = NewFeaturesEmail.PreviewProps.features[0]!;
    const four = [f, { ...f, title: "Two" }, { ...f, title: "Three" }, { ...f, title: "Four" }];
    const html = await render(NewFeaturesEmail({ ...NewFeaturesEmail.PreviewProps, features: four }));
    expect(html).toContain("Three");
    expect(html).not.toContain("Four");
  });
});
