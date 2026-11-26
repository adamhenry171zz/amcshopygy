# Smart SHEIN quotation system — phase 1 preview

**Release status:** draft, do not merge or enable production without the owner's approval. The new injector is gated by AMC_SMART_SHEIN_ENABLE_PRODUCTION=true in a production Netlify context. Use fictional customers in the preview. The new API uses a deploy-specific Blobs store for non-production requests. Existing unrelated website and HENRY OS functions are not covered by this isolation; do not test legacy operations on a preview using production credentials or records.

## Existing system audit

- The published site is assembled from AMC_Shopping_DEPLOY_READY_v5_2.zip with successive injectors in netlify.toml. Editing the root quote.html alone does not reliably alter the deployed site.
- deploy-v55/quote.js controls the retailer tabs and legacy request validation. deploy-v55/shein-calculator.js contains the per-item shipping policy; retain the legacy estimator and store forms during testing.
- Existing henry-public.js sends only string fields to henry-inquiry-submit; that handler saves a limited inquiry message, not all product links, product variants or screenshot attachments.
- The existing HENRY OS owner session uses HENRY_ADMIN_EMAIL, HENRY_SESSION_SECRET and the signed henry_session cookie; the new owner API uses this authentication. It does not introduce another login.
- The new module is injected after the existing modules, with a dedicated review queue and quotation records. It does not write invoice, membership or payment-module records.

## Extraction investigation

- SHEIN developer platform: https://open.sheincorp.com/ — merchant-facing documented interfaces; no confirmed public consumer cart-sharing API found.
- US terms: https://m.shein.com/us/Terms-and-Conditions-a-399.html — review restrictions on automated access and commercial use before any integration.
- Vendor candidate: https://www.omkar.cloud/tools/shein-scraper/cart-products — vendor claims shared-cart extraction, including selected variant, but states SHEIN sharing does not include quantities. Availability and permission not independently verified. No subscription, external requests or keys configured.
- Customer-supplied export option: https://share-a-cart.com/supported/shein/how-to-export — claims spreadsheet export including title, qty, unit price, currency, SKU where available and link. Use only customer-provided data and an authorized method.
- Current prototype validates HTTPS SHEIN-domain links, preserves them for owner review, and imports tab-separated customer exports. Missing quantities, sizes, colours and weights are not invented. Screenshots are stored privately, not processed by OCR in phase 1. The extraction action currently reports that a provider is not configured, not a successful extraction.
- Before implementing a live adapter: obtain permission or an authorized API, compare 10–20 genuine consented USA share links against checkout, verify prices/currency/variants/duplicates/quantities, and evaluate cost, expiry, failures and privacy. Never request passwords or session cookies.

## Pricing

- Server-side USD cents; overall rounded up to GYD 100 from (USD x 360 + additional per-unit heavy-item charges + approved GYD extras). Down payment rounded up from USD x 240. Balance = overall - down; never round independently.
- USD checkout fees are included in both conversions; separately quoted GYD fees and heavy-item freight are included in the arrival balance. These treatment assumptions must be reviewed by the owner.
- Existing live SHEIN rate table: <=3 lb per individual item no additional charge; >3 lb full per-unit weight at rate: up to 10 lb 1500, up to 25 lb 1300, up to 55 lb 1200, up to 99 lb 1100, otherwise 1050 GYD/lb. Multiply by quantity. Unknown weight requires explicit owner acknowledgment.
- No Members Club discount, no automatic insurance; any verified optional charge requires owner explanation. No separate rounding per row for grand total.
- Owner selects a Tuesday placement date; estimate +14 and +21 days, not a guarantee.

## Next work / release blockers

1. Authorized extraction adapter and field mapping; real link regression fixtures (no real customer details in Git).
2. Reproduce actual November Premium Blue customer quotation layout (not shipping invoice): deep navy header with existing white AMC logo, cyan band, customer/source/scheduled order blocks, estimated arrival panel, blue overall card, white deposit card, prominent red balance card, product/variation table with indicative per-item GYD, payment instructions and terms. Reference the owner's most recent SHEIN quotation and master prompt; do not commit customer sample PDFs. Implement owner-approved PDF generation, pagination and visual checks.
3. Add owner-controlled WhatsApp delivery of approved PDFs, and integrate payment entries with existing HENRY OS finance/accounting only after verifying identity, ledger idempotency, reversals and reconciliation. Current quote-local tracking is not a finance ledger.
4. Add pagination, retention/deletion policies, atomic rate limit, preview login/legacy isolation review, mobile/browser QA and final production approval. Consolidate the legacy SHEIN request UI after testing to avoid two customer pathways. Preserve non-SHEIN retailers.
5. Run full Netlify build and integration tests; never infer success from a commit alone. Preview is not production and its data will not carry over.
