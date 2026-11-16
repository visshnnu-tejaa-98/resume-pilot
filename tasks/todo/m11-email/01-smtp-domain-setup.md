# SMTP provider + sending domain setup

**Milestone:** M11 · prd.md §13.7, §16.4
**Status:** todo

## Scope

- Pick the SMTP provider Nodemailer sends through (open decision §16.4). Any provider with SMTP credentials works; `packages/emails/src/send.ts` reads `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` and `EMAIL_FROM_ADDRESS`, so there's no vendor SDK.
- Verify the sending subdomain (e.g. `mail.<domain>`) with the provider; configure and verify SPF, DKIM (the provider's DNS records) and DMARC
- Record the provider's sending limits (daily and per second); the campaign throttle (M11-03) is set below them
- Replies route to the support email
- The admin "Email templates" page shows SPF/DKIM/DMARC status (DNS lookups, not a provider API)

## Done when

- A test send from the deployed app reaches a real Gmail and Outlook inbox (not spam), with SPF/DKIM/DMARC passing in the message headers
- SPF/DKIM/DMARC all show "verified" on the admin status page
