import { getStore } from "@netlify/blobs";

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});
const clean = (value, max = 80) => String(value ?? "").trim().replace(/[<>]/g, "").slice(0, max);
const normalizePhone = value => clean(value, 30).replace(/[^0-9+() -]/g, "");
const codeCandidate = () => `AMC${Math.floor(10000 + Math.random() * 90000)}`;

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  let body;
  try { body = await req.json(); } catch { return json({ error: "Invalid request." }, 400); }
  const firstName = clean(body.firstName, 50);
  const lastName = clean(body.lastName, 50);
  const whatsapp = normalizePhone(body.whatsapp);
  const email = clean(body.email, 120);
  if (!firstName || !lastName || whatsapp.replace(/\D/g, "").length < 7) return json({ error: "Please enter your first name, last name and a valid WhatsApp number." }, 400);

  const store = getStore("amc-mailboxes");
  const phoneKey = whatsapp.replace(/\D/g, "");
  const existing = await store.get(`contacts/${phoneKey}`, { type: "json" });
  let code = existing?.code || null;

  if (!code) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const candidate = codeCandidate();
      const record = { code: candidate, firstName, lastName, whatsapp, email, createdAt: new Date().toISOString() };
      const result = await store.setJSON(`mailboxes/${candidate}`, record, { onlyIfNew: true });
      if (result.modified) { code = candidate; break; }
    }
    if (!code) return json({ error: "AMC could not issue a mailbox code right now. Please try again or WhatsApp us." }, 503);
    await store.setJSON(`contacts/${phoneKey}`, { code, firstName, lastName, whatsapp, email, createdAt: new Date().toISOString() }, { onlyIfNew: true });
  }

  return json({
    code,
    firstName,
    lastNameCheckout: `${lastName} AMC`,
    address1: "14619 228th Street",
    city: "Springfield Gardens",
    state: "NY",
    zip: "11413",
    country: "United States",
    phone: "+1 592 604 2826"
  });
};
