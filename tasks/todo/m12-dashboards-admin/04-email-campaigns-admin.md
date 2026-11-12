# Admin: email templates, campaigns, log

**Milestone:** M12 · prd.md §13.3 (admin bits), §13.4, §13.6, §16.2.19
**Status:** todo

## Scope

- Email Templates page: preview with sample data, "send test to me", switch marketing templates on/off, set subject/preheader per campaign, SPF/DKIM/DMARC status
- Campaigns: audience filter builder (§13.4.1) with live recipient count after exclusions (§13.4.2); message builder with merge fields + live preview; send now or schedule (IST); confirm dialog (template, recipient count, time) → audit log
- Campaign statuses: draft, scheduled, sending, sent, cancelled; scheduled campaigns cancellable before start; audience frozen at send start, opt-outs mid-send are skipped
- Email Log: `email_messages` rows, masked recipient (`as***@gmail.com`), full address on user detail page; admin metrics for last 30 days

## Done when

- A campaign's recipient count at send time matches the confirmation count minus anyone who opted out during the send (acceptance criterion 16.2.19)
