# AMC Shopping — DEPLOY READY v5.2

Production-ready no-portal website for amcshopping.com.

## v5.2 additions
- Streaming section rebuilt from the current AMC Streaming Plans flyer.
- Netflix private-account pricing added for Basic, Standard and Premium durations.
- Netflix Extra Member Add-On added at GYD $1,500 per 30 days.
- Disney+ Shared Access: GYD $2,000 / 30 days.
- Prime Video Shared Access: GYD $2,000 / 30 days.
- Disney+ + Prime bundle: GYD $3,500 / 30 days.
- IPTV: GYD $3,500 / 30 days.
- Crunchyroll remains inquiry pricing.
- Streaming terms from the flyer are displayed clearly on the website.
- AMC streaming flyer optimized and included as `site/assets/amc-streaming-plans.webp`.
- New package arrival estimator on the Tracking page.
- Arrival estimator uses AMC's Saturday 2:30 PM New York-time cutoff and normal Thursday–Friday Guyana arrival window.
- Saturday deliveries without a delivery time show both possible weekly-cycle windows rather than guessing.
- Homepage now has a direct "estimate my arrival" callout.
- Homepage SHEIN calculator corrected to PER ITEM and made functional.

## SHEIN Card Service rule
- Every individual SHEIN item uses: USD item value × GYD 360.
- If that individual item is 1–3 lb: no extra weight charge is added.
- If that individual item exceeds 3 lb: normal AMC shipping for that item's full billable weight is added on top of the USD × 360 card-service amount.
- Members Club does not apply to the SHEIN Card Service.

## Current AMC standard shipping rates
- 1–2 lb: GYD 2,800 flat
- 1–10 lb: GYD 1,500/lb (above the 1–2 lb flat range)
- 11–25 lb: GYD 1,300/lb
- 26–55 lb: GYD 1,200/lb
- 56–99 lb: GYD 1,100/lb
- 100+ lb: GYD 1,050/lb
- Members Club comparison uses GYD 950/lb.

## Existing core features
- AMC navy / electric-blue branding
- SHEIN and Amazon Netlify quotation forms
- Automatic AMC mailbox generator with collision-resistant five-digit AMC codes stored in Netlify Blobs
- Mailbox checkout phone: +1 592 604 2826
- ParcelsApp tracking widget
- TikTok Coins, gaming, gift cards and digital-service requests
- Contact forms, sitemap, redirects and security headers

## IMPORTANT deployment method
This version contains a Netlify Function. Deploy the PROJECT ROOT (the folder containing `package.json`, `netlify.toml`, `site/`, and `netlify/`), not only the `site/` folder.

### Manual Netlify deployment
1. Sign into Netlify.
2. Deploy the full `AMC_Shopping_DEPLOY_READY_v5_2` project folder.
3. Netlify detects the Node dependency and deploys the mailbox function.
4. Test the temporary `.netlify.app` URL first.
5. Test mailbox generation, forms, streaming selections, SHEIN calculator, arrival estimator and tracking.
6. When satisfied, connect or update amcshopping.com.

### Best long-term update method
Connect this project to a private GitHub repository. Netlify then automatically deploys whenever the repository changes. This gives version history, preview deploys and rollback safety.

See `SITE-UPDATES.md` for the simple update workflow.
