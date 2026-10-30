# AMC Shopping — delivery website update (staged, NOT live)

## Placement
- Main customer-facing section on `/mailbox`: **Delivery to Your Doorstep**
- Link from the website's relevant shipping / customer help pages as appropriate.
- Keep existing mailbox instant-signup form, shipping calculators, tracking and navigation intact.

## Customer-facing draft
### Delivery to Your Doorstep
**Your Package. Our Priority. Always.**

We operate with a streamlined, delivery-focused service model to keep shipping convenient and costs competitive. Instead of relying on traditional walk-in collections, we coordinate deliveries directly with customers.

**Free delivery** is available for qualifying shipments weighing **5 lbs or more** within **designated Georgetown delivery areas**. For smaller shipments or addresses outside those areas, request a location-based delivery quote before deciding.

**Regular delivery hours:** Monday–Saturday, 11:00 AM–5:00 PM. Deliveries after 5:00 PM may incur an additional fee and depend on availability. Sunday deliveries are by special arrangement only, at an additional charge.

Use **Check Delivery Cost** to request a quote without committing to delivery, or **Request Delivery** to provide your address, nearby landmark, preferred date/time and, if you choose, a location pin.

**All delivery quotes, dates and times require confirmation from AMC Shopping.** Submitting a request does not guarantee a delivery slot. Payment requirements are confirmed individually.

## Form fields
- Request type: Check Delivery Cost / Request Delivery
- Customer name and WhatsApp number
- Package reference / mailbox ID (optional)
- Estimated package weight (optional; owner verifies final billable weight)
- Address and landmark
- Location pin (optional; explicit permission; manual fallback)
- Preferred delivery date and time
- Delivery instructions
- Consent checkbox for use of contact/location details to process request
- Server-generated reference (not client-only)
- Initial status: awaiting_review

## Backend requirements before activation
- Verified, rate-limited server endpoint; spam controls
- Persist to Supabase with owner-only read/write RLS
- No public direct access to private request table
- Customer consent for location; manual address fallback
- Current `Permissions-Policy` globally denies geolocation: change only the relevant route if location picker is implemented
- Owner-managed coverage zones and pricing; do not automatically promise eligibility based on a Georgetown text address
- Validate requested day/time; Sunday/after-hours requests marked as special arrangement
- Owner reviews quote, availability and payment requirements
- Notifications and admin workflow to be implemented and tested
- No fake confirmations or fake payment verification

## Deployment safety
The existing site is built from a ZIP plus sequential injectors through `deploy-v60`. Add a **new versioned injector** to a staging branch, verify idempotence, and inspect the resulting mailbox HTML before changing the production build. This document alone does not change the site.
