# Resume Pilot — UI designs

Design source for every screen, exported from the Claude Design canvas. These are **reference designs**, not production code: build the real pages in `apps/web` with Next.js, Tailwind and shadcn/ui, and use these files for layout, copy, colours and states.

## Files

- `screens/*.dc.html` — one file per screen or shared part. Each `XDark.dc.html` file is a thin wrapper that shows screen `X` in dark mode; the real markup is in `X.dc.html`.
- `canvas.json` — how the screens are arranged on the canvas (pages, positions, sizes, notes).

## Opening them

The files use the canvas runtime (`support.js`), which isn't included, so they won't render if opened directly in a browser. To view a screen, open the canvas in Claude. To build from one, read its markup and the palette in its `renderVals()` script.

## Design tokens

| Token | Light | Dark |
| --- | --- | --- |
| Background | #F4F6F8 | #0A1119 |
| Surface | #FFFFFF | #111B27 |
| Text | #0F1B2A | #E8EEF5 |
| Secondary text | #4B5A6B | #A3B3C5 |
| Accent (signal orange) | #FF9900 | #FF9F1C |
| Link (route blue) | #0A6BCB | #5AABFF |
| Hero navy | #0F1B2A | #060B12 |

Fonts: Inter (UI), Space Grotesk (headings), JetBrains Mono (numbers and codes).

## Screen index

### Design system and shared parts (5)

- `AppSide.dc.html`
- `AppTopBar.dc.html`
- `Main.dc.html`
- `SiteFooter.dc.html`
- `SiteNav.dc.html`

### Public (11)

- `About.dc.html`
- `Contact.dc.html`
- `FAQ.dc.html`
- `HowItWorks.dc.html`
- `Landing.dc.html`
- `Legal.dc.html`
- `NotFound.dc.html`
- `Pricing.dc.html`
- `SignIn.dc.html`
- `SignUp.dc.html`
- `Welcome.dc.html`

### User app (17)

- `AtsReport.dc.html`
- `Compare.dc.html`
- `Dashboard.dc.html`
- `Editor.dc.html`
- `GenProgress.dc.html`
- `Generate.dc.html`
- `JobNew.dc.html`
- `Jobs.dc.html`
- `MyResumes.dc.html`
- `PaymentResult.dc.html`
- `Preview.dc.html`
- `Referrals.dc.html`
- `ResumeReview.dc.html`
- `Settings.dc.html`
- `Suspended.dc.html`
- `Upload.dc.html`
- `Wallet.dc.html`

### Admin (17)

- `AdminAiJobDetail.dc.html`
- `AdminAiJobs.dc.html`
- `AdminAudit.dc.html`
- `AdminCampaign.dc.html`
- `AdminCoupons.dc.html`
- `AdminEmailLog.dc.html`
- `AdminEmails.dc.html`
- `AdminLedger.dc.html`
- `AdminOverview.dc.html`
- `AdminPayments.dc.html`
- `AdminPricing.dc.html`
- `AdminSettings.dc.html`
- `AdminSide.dc.html`
- `AdminTemplates.dc.html`
- `AdminTopBar.dc.html`
- `AdminUserDetail.dc.html`
- `AdminUsers.dc.html`

### Email (10)

- `EmailCodeApplied.dc.html`
- `EmailFooter.dc.html`
- `EmailHeader.dc.html`
- `EmailInactive.dc.html`
- `EmailNewFeatures.dc.html`
- `EmailPayFailed.dc.html`
- `EmailPayPending.dc.html`
- `EmailPaySuccess.dc.html`
- `EmailPromo.dc.html`
- `EmailWelcome.dc.html`

## Not yet matching PRD v2.2

- Promo-code email (`EmailPromo`) and gift-code options in `AdminCampaign` are postponed in the PRD.
- Referral amounts still show 500 credits; the PRD now says 100 to each side.
- Storage notes mention ImageKit; the PRD now uses S3.
