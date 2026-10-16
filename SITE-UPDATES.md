# Updating AMC Shopping after launch

## Recommended: GitHub + Netlify
1. Keep the AMC project in a private GitHub repository.
2. Connect that repository to the existing Netlify project.
3. Any approved change pushed to the main branch automatically creates a production deploy.
4. Use a Netlify preview/temporary URL to test larger updates first.
5. If an update causes a problem, roll back to the previous production deploy.

## Simple manual method
If you are not using GitHub yet:
1. Keep a master copy of the latest AMC project folder.
2. Make changes in that copy.
3. Test on a temporary Netlify deployment.
4. Deploy the updated project root.

## Common edits
- Streaming, game, gift-card and TikTok catalogue: `site/assets/digital-catalog.js`
- Streaming flyer image: `site/assets/amc-streaming-plans.webp`
- Streaming / digital page layout: `site/topups.html`
- Streaming / digital catalogue rendering: `site/assets/topups.js`
- Arrival estimator rule: `site/assets/arrival-estimator.js`
- Tracking / arrival-estimator page: `site/tracking.html`
- Shipping calculator: `site/assets/app.js`
- SHEIN multi-item calculator: `site/assets/shein-calculator.js`
- Shipping rate cards: `site/rates.html`
- Homepage content: `site/index.html`

## Current weekly arrival-estimator rule
- Weekly US warehouse cutoff: Saturday 2:30 PM New York time.
- Package delivered Sunday through Friday: rolls into the upcoming Saturday cycle.
- Package delivered Saturday by 2:30 PM: same Saturday cycle.
- Package delivered Saturday after 2:30 PM: next Saturday cycle.
- Normal Guyana arrival estimate: Thursday–Friday after the applicable Saturday cutoff.
- This is an estimate, not a guaranteed arrival or ready-for-collection date.

## Current streaming pricing
Edit these in `site/assets/digital-catalog.js` when prices change.
- Netflix Basic: 90d 6,500; 120d 8,500; 150d 10,000; 180d 12,000 GYD
- Netflix Standard: 60d 6,500; 90d 9,500; 120d 12,500; 150d 15,000; 180d 18,000 GYD
- Netflix Premium: 30d 5,000; 60d 9,500; 90d 14,000; 120d 18,500; 150d 22,500; 180d 26,500 GYD
- Netflix Extra Member Add-On: 1,500 GYD / 30 days
- Disney+: 2,000 GYD / 30 days
- Prime Video: 2,000 GYD / 30 days
- Disney+ + Prime: 3,500 GYD / 30 days
- IPTV: 3,500 GYD / 30 days
- Crunchyroll: inquiry pricing

## SHEIN Card Service
- Per item: USD × GYD 360.
- Each item up to 3 lb has no additional shipping charge.
- An individual item over 3 lb adds normal AMC shipping for that item's full billable weight.
- Members Club is separate and does not discount this card service.
