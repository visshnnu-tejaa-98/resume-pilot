import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";
import { PromoEmail } from "./templates/Promo";
import { WelcomeEmail } from "./templates/Welcome";

describe("WelcomeEmail", () => {
  const props = {
    firstName: "Asha",
    referralCode: "EARLYBIRD",
    uploadUrl: "https://app.resumepilot.app/dashboard",
  };

  it("renders the recipient's name and referral code, light and dark", async () => {
    for (const dark of [false, true]) {
      const html = await render(WelcomeEmail({ ...props, dark }));
      expect(html).toContain("Asha");
      expect(html).toContain("EARLYBIRD");
      expect(html).toContain(props.uploadUrl);
    }
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
