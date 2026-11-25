import { faker } from "@faker-js/faker";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index";

const connectionString =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:55432/resume_pilot";

/**
 * Local-dev seed data only — config rows match the values the PRD
 * already settled on (prd.md §2, §9.1, §10.2, §16.4); sample users are
 * fake. Never run against a real environment.
 */
async function main() {
  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client, { schema });

  // --- Resume templates (prd.md §10.2) ---------------------------------
  await db
    .insert(schema.resumeTemplates)
    .values([
      { key: "classic", name: "Classic" },
      { key: "modern", name: "Modern" },
      { key: "minimal", name: "Minimal" },
      { key: "professional", name: "Professional" },
      { key: "technical", name: "Technical" },
    ])
    .onConflictDoNothing();

  // --- Credit packages (prd.md §2 — only the two settled so far) ------
  await db
    .insert(schema.creditPackages)
    .values([
      { pricePaise: 50_000, credits: 10_000, bonusCredits: 0, sortOrder: 0 },
      { pricePaise: 100_000, credits: 20_000, bonusCredits: 1_000, sortOrder: 1 },
    ])
    .onConflictDoNothing();

  // --- Pricing config v1 (placeholder — real values pending the eval
  // set in tasks/todo/m13-testing-deploy/01-eval-set.md) ----------------
  await db
    .insert(schema.pricingConfig)
    .values({
      version: 1,
      modelPrices: {
        "gpt-5.1": { inputPerMillionUsd: 2.5, outputPerMillionUsd: 10 },
      },
      usdToInrRate: "83.0000",
      markupMultiplier: "3.000",
      minimumCreditsPerAction: 50,
      creditValueInr: "0.0500", // ₹500 / 10,000 credits (prd.md §3.3)
      note: "Seed placeholder — replace once the eval set is measured",
    })
    .onConflictDoNothing();

  // --- Launch coupon (prd.md §2.1) -------------------------------------
  await db
    .insert(schema.coupons)
    .values({ code: "EARLYBIRD", credits: 500, active: true })
    .onConflictDoNothing();

  // --- Email template settings (prd.md §13.1) --------------------------
  await db
    .insert(schema.emailTemplateSettings)
    .values([
      { templateKey: "inactive_nudge", enabled: true },
      { templateKey: "new_features", enabled: true },
    ])
    .onConflictDoNothing();

  // --- A handful of fake users with wallets, for local dev -------------
  for (let i = 0; i < 3; i++) {
    const [user] = await db
      .insert(schema.users)
      .values({
        clerkUserId: `seed_${faker.string.uuid()}`,
        email: faker.internet.email(),
      })
      .returning();

    if (!user) continue;

    await db.insert(schema.creditAccounts).values({ userId: user.id, balance: 0 });
    await db.insert(schema.referralCodes).values({
      userId: user.id,
      code: `RP-${faker.string.alphanumeric(6).toUpperCase()}`,
    });
    await db.insert(schema.emailPreferences).values({ userId: user.id });
  }

  await client.end();
  console.log("Seed complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
