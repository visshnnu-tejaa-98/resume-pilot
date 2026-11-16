import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";
import { PromoEmail } from "./templates/Promo";
import { WelcomeEmail } from "./templates/Welcome";

describe("WelcomeEmail", () => {
  const props = {
    firstName: "Asha",
    launchCoupon: { code: "EARLYBIRD", credits: 500 },
    referralCredits: 100,
    uploadUrl: "https://app.resumepilot.app/dashboard",
    walletUrl: "https://app.resumepilot.app/wallet",
  };

  it("renders name, launch coupon, referral option and links, light and dark", async () => {
    for (const dark of [false, true]) {
      const html = await render(WelcomeEmail({ ...props, dark }));
      expect(html).toContain("Asha");
      expect(html).toContain("EARLYBIRD");
      expect(html).toContain("500 free credits");
      expect(html).toContain("100 credits");
      expect(html).toContain(props.uploadUrl);
      expect(html).toContain(props.walletUrl);
    }
  });

  it("uses the coupon amount from props, not a hardcoded 500", async () => {
    const html = await render(
      WelcomeEmail({ ...props, launchCoupon: { code: "LAUNCH25", credits: 2500 } }),
    );
    expect(html).toContain("LAUNCH25");
    expect(html).toContain("2,500 free credits");
    expect(html).not.toContain("EARLYBIRD");
  });

  it("hides the gift block when there's no active launch coupon, keeps the referral option", async () => {
    const html = await render(WelcomeEmail({ ...props, launchCoupon: null }));
    expect(html).not.toContain("EARLYBIRD");
    expect(html).not.toContain("Claim");
    expect(html).toContain("100 free credits");
    expect(html).toContain("0 credits");
  });

  it("has a plain-text version", async () => {
    const text = await render(WelcomeEmail(props), { plainText: true });
    expect(text).toContain("Asha");
    expect(text.length).toBeGreaterThan(0);
  });
});

describe("PromoEmail", () => {
  const props = {
    firstName: "Asha",
    segmentReason: "Thanks for tailoring 3 resumes with us",
    credits: 1000,
    code: "ASHA-K7Q2",
    expiresOn: "31 Mar 2027",
    claimUrl: "https://app.resumepilot.app/wallet",
  };

  it("renders the credit amount and code, light and dark", async () => {
    for (const dark of [false, true]) {
      const html = await render(PromoEmail({ ...props, dark }));
      expect(html).toContain("ASHA-K7Q2");
      expect(html).toContain("1,000");
      expect(html).toContain(props.claimUrl);
    }
  });

  it("includes an unsubscribe link in its footer (marketing email)", async () => {
    const html = await render(
      PromoEmail({ ...props, unsubscribeUrl: "https://app.resumepilot.app/unsubscribe/tok" }),
    );
    expect(html).toContain("https://app.resumepilot.app/unsubscribe/tok");
  });
});
