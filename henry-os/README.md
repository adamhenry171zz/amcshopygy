# HENRY OS — implementation branch (unpublished)

Target route: `/admin` on amcshopping.com, but **not active** until approved.

## Existing site constraints
- Netlify build extracts `AMC_Shopping_DEPLOY_READY_v5_2.zip` and applies injectors through `deploy-v60`.
- Do not modify `main`, `netlify.toml`, or public site pages until integration is reviewed.
- Existing Netlify `Permissions-Policy` disables geolocation globally; the eventual customer delivery pin feature requires a carefully scoped policy change, consent, and a manual map/address fallback.
- Existing mailbox generation uses Netlify Blobs; do not assume it is already in Supabase.
- No actual analytics, financial records, invoices, or subscriptions are automatically connected.

## Security design
- Supabase Auth for owner sign-in, MFA recommended.
- RLS on every business table; default deny, owner account explicitly provisioned.
- Never expose service-role key in browser code or Git.
- Payment references are evidence for manual review, not proof of settlement.
- Audit log for changes, secure backups, and server-side validation required.
- This branch currently contains foundation schema and architecture only, not a functioning production dashboard.

## Work plan
1. Configure Supabase project, owner identity, and environment variables.
2. Build protected admin UI and server-verified sessions.
3. Implement AMC delivery quotes, customer pin/address consent, day/time requests and owner approval.
4. Add AMC customers, mailboxes, shipments, invoices and subscription renewals.
5. Add Mystic clients, quotes, projects, revision limits and payments.
6. Build aggregate reporting and audit feed.
7. Test staging preview and security, then request explicit permission to merge/deploy.

Delivery defaults: Mon–Sat 11 AM–5 PM; Sunday special arrangement; after-hours surcharge by quote; free eligible 5+ lb within designated Georgetown areas (coverage owner-defined). All requests pending approval.
