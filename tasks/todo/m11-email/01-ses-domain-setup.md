# SES + sending domain setup

**Milestone:** M11 · prd.md §13.7, §16.4
**Status:** todo

## Scope

- Verify sending subdomain (e.g. `mail.<domain>`) in SES; SPF, DKIM (Easy DKIM), DMARC configured and verified
- Request SES production access before launch (sandbox only allows verified recipients + low daily limit)
- Replies route to support email
- Admin "Email templates" page shows SPF/DKIM/DMARC status
- Open decision (§16.4): exact sender address/subdomain, confirm SES as Nodemailer's SMTP target

## Done when

- Test send delivers to a non-whitelisted real inbox (i.e. production access granted, not sandbox)
- SPF/DKIM/DMARC all show "verified" in the admin status page
