/* HENRY OS: owner-only Netflix migration preview. Never uploads source passwords. */
export const SNAPSHOT_DATE = "2026-11-04";
const START = "2026-10-01";
const END = "2026-11-30";
const SHEET = "N/ACCOUNTS / Sheet1";

export function parseCSV(source) {
  const text = String(source || "").replace(/^\uFEFF/, "");
  const rows = []; let row = []; let field = ""; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else if (quoted) quoted = false;
      else if (field === "") quoted = true;
      else throw new Error("Invalid quote in CSV at character " + (i + 1));
    } else if (!quoted && c === ",") {
      row.push(field); field = "";
    } else if (!quoted && (c === "\r" || c === "\n")) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (quoted) throw new Error("Unclosed quoted field in CSV");
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows; // Preserve original blank rows so audit row numbers match Google Sheets.
}

const normHeader = s => String(s || "").trim().replace(/\s+/g, " ").toUpperCase();
export function strictDate(value) {
  const m = String(value || "").trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!m) return "";
  const yyyy = +m[1], mm = +m[2], dd = +m[3];
  const d = new Date(Date.UTC(yyyy, mm - 1, dd));
  if (d.getUTCFullYear() !== yyyy || d.getUTCMonth() + 1 !== mm || d.getUTCDate() !== dd) return "";
  return [m[1], String(mm).padStart(2, "0"), String(dd).padStart(2, "0")].join("-");
}
export function parseAmount(value) {
  const str = String(value || "").trim().replace(/(?:GYD|G\$|\$|,|\s)/gi, "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(str)) return "";
  const amount = Number(str);
  return Number.isFinite(amount) && amount > 0 && amount <= 10000000 ? amount.toFixed(2) : "";
}
const identity = x => String(x || "").trim().toLowerCase().replace(/\s+/g, " ");
const phone = x => String(x || "").replace(/\D/g, "");
const validId = x => /^[a-z0-9_-]{8,60}$/i.test(x);

export function prepareMigration(csv, existing = []) {
  const matrix = parseCSV(csv);
  if (!matrix.length) throw new Error("The selected CSV is empty");
  const headers = matrix[0].map(normHeader);
  const required = ["NAME", "EMAIL", "WHATSAPP NUMBER", "ACCOUNT TYPE", "DATE", "AMOUNT",
    "ACCOUNT PAYMENT DATE", "SUBSCRIPTION ID"];
  const missing = required.filter(x => !headers.includes(x));
  if (missing.length) throw new Error("Not the expected Netflix Sheet1 export. Missing: " + missing.join(", "));
  const index = name => headers.indexOf(normHeader(name));
  const found = [];
  const seen = new Set();
  const savedIds = new Set(existing.map(x => String(x.id || "")));
  const existingNetflix = existing.filter(x => identity(x.service) === "netflix");
  const summary = { ready: [], review: [], ignored: [], existing: [], total: 0 };
  for (let n = 1; n < matrix.length; n++) {
    const values = matrix[n];
    const val = key => String(values[index(key)] || "").trim();
    const rowNumber = n + 1; // matches Google Sheet row for an unfiltered CSV export
    const name = val("NAME"), email = val("EMAIL"), whatsapp = val("WHATSAPP NUMBER");
    const sourceId = val("SUBSCRIPTION ID");
    if (!name && !email && !whatsapp) {
      if (sourceId || values.some(v => String(v || "").trim()))
        summary.ignored.push({row:rowNumber, reason:"No identifiable customer; ID-only/placeholder"});
      continue;
    }
    summary.total++;
    const item = {row:rowNumber, customer:name || "(name missing)", reason:"", sourceId};
    if (!name) item.reason = "Missing customer name";
    else if (!validId(sourceId)) item.reason = "Missing or invalid subscription ID";
    else if (seen.has(sourceId.toLowerCase())) item.reason = "Duplicate subscription ID in CSV";
    seen.add(sourceId.toLowerCase());
    const service = val("SERVICE");
    if (!item.reason && service && identity(service) !== "netflix")
      item.reason = "Service is not Netflix; other services must be added manually";
    const renewalRaw = val("DATE"), renewal = strictDate(renewalRaw);
    const expiryRaw = val("EXPIRY DATE"), expiry = strictDate(expiryRaw);
    const accountDueRaw = val("ACCOUNT PAYMENT DATE"), accountDue = strictDate(accountDueRaw);
    const amount = parseAmount(val("AMOUNT"));
    if (!item.reason && renewalRaw && !renewal) item.reason = "Invalid customer renewal date";
    if (!item.reason && expiryRaw && !expiry) item.reason = "Invalid expiry date";
    if (!item.reason && !amount) item.reason = "Missing or invalid customer charge";
    const isOctNov = renewal >= START && renewal <= END;
    const isFutureRenewal = renewal > SNAPSHOT_DATE;
    const futureExpiry = expiry > SNAPSHOT_DATE;
    if (!item.reason && !(isOctNov || isFutureRenewal || futureExpiry))
      item.reason = "No October–November 2026 customer renewal or later future renewal/expiry date";
    if (item.reason) { summary.review.push(item); continue; }
    const id = "netflix-" + sourceId;
    const match = existingNetflix.find(x => identity(x.customer) === identity(name) &&
      phone(x.whatsapp).length >= 7 && phone(x.whatsapp) === phone(whatsapp));
    if (savedIds.has(id) || match) {
      summary.existing.push({...item, reason:savedIds.has(id)
        ? "Already imported; leave existing record unchanged"
        : "Possible existing Netflix subscription with same name and number; review"});
      continue;
    }
    const notes = [
      "Imported from " + SHEET + " row " + rowNumber + " (migration snapshot " + SNAPSHOT_DATE + ").",
      isFutureRenewal ? "Future customer renewal date is treated as prepaid; no past payment transaction was created." : "",
      renewal && renewal <= SNAPSHOT_DATE ? "Active by owner rule; stored renewal date has passed and needs owner verification; do not invent a new date." : "",
      futureExpiry && (!renewal || renewal <= SNAPSHOT_DATE)
        ? "Future expiry preserved for reference; customer payment due date requires verification." : "",
      accountDue ? "Netflix provider-side account payment date: " + accountDue + " (not customer payment due)." : ""
    ].filter(Boolean).join(" ");
    summary.ready.push({
      ...item, reason:renewal && renewal <= SNAPSHOT_DATE ? "Active; renewal date needs verification" :
        !renewal ? "Active; verify next customer billing date" : "Active; future renewal preserved",
      record:{
        customer:name, whatsapp, service:"Netflix", plan:val("ACCOUNT TYPE"), amount,
        dueDate:renewal || "", status:"active", accountEmail:email, notes
      },
      id
    });
  }
  return summary;
}

async function request(url, options = {}) {
  const r = await fetch(url, { credentials:"same-origin", cache:"no-store", ...options });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || ("Request failed (" + r.status + ")"));
  return data;
}
const $ = id => document.getElementById(id);
function say(text, error=false) {
  const e=$("notice"); e.textContent=text; e.className=error?"status error":"status";
}
function showRows(rows, table, limit=100) {
  const body=$(table); body.replaceChildren();
  for (const x of rows.slice(0,limit)) {
    const tr=document.createElement("tr");
    for (const value of [x.row, x.customer || "", x.reason || ""]) {
      const td=document.createElement("td"); td.textContent=String(value); tr.appendChild(td);
    }
    body.appendChild(tr);
  }
}
let prepared=null;
let loadedExisting=[];
async function refreshExisting() {
  const result = await request("/.netlify/functions/henry-amc?action=list&type=streaming");
  loadedExisting=Array.isArray(result.items)?result.items:[];
}
async function handleFile(e) {
  prepared=null;
  $("commit").disabled=true;
  $("approved").checked=false;
  const file=e.target.files?.[0];
  if (!file) return;
  if (file.size > 3_000_000) { say("CSV is larger than 3 MB; export Netflix Sheet1 alone.",true);return; }
  try {
    await refreshExisting();
    const csv = await file.text();
    prepared = prepareMigration(csv, loadedExisting);
    $("ready-count").textContent=prepared.ready.length;
    $("review-count").textContent=prepared.review.length;
    $("ignored-count").textContent=prepared.ignored.length;
    $("existing-count").textContent=prepared.existing.length;
    showRows(prepared.ready,"ready-rows");
    showRows([...prepared.review,...prepared.existing,...prepared.ignored],"review-rows");
    $("approved").disabled=prepared.ready.length===0;
    say("Preview complete. No data was written. Review past-due dates and excluded rows before importing.");
  } catch(err){say(err.message,true);}
}
async function commit() {
  if (!prepared || !prepared.ready.length || !$("approved").checked) return;
  const count=prepared.ready.length;
  if (!confirm("Import up to " + count + " Netflix subscriptions into HENRY OS?\n\nNo passwords or historic payment transactions will be sent. Existing subscriptions are never overwritten.")) return;
  $("commit").disabled=true;$("picker").disabled=true;$("approved").disabled=true;
  let saved=0,skipped=0;
  try {
    await refreshExisting();
    const already=new Set(loadedExisting.map(x=>String(x.id||"")));
    for (const item of prepared.ready) {
      const matching=loadedExisting.some(x=>identity(x.service)==="netflix" &&
        identity(x.customer)===identity(item.record.customer) &&
        phone(x.whatsapp).length>=7 && phone(x.whatsapp)===phone(item.record.whatsapp));
      if (already.has(item.id) || matching) {skipped++;continue;}
      await request("/.netlify/functions/henry-amc?action=save", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({type:"streaming",id:item.id,record:item.record})
      });
      already.add(item.id);loadedExisting.push({...item.record,id:item.id});
      saved++; say("Imported " + saved + " of " + count + " (skipped " + skipped + ").");
    }
    say("Finished: " + saved + " new Netflix subscriptions; " + skipped + " existing matches skipped. No payment history fabricated. Refresh HENRY OS Streaming to see the records.");
    prepared=null;
  } catch(err){say("Import stopped after " + saved + " saved and " + skipped + " skipped: " + err.message + ". Reopen the CSV to retry; stable IDs prevent duplicates.",true);}
  finally {$("picker").disabled=false;$("approved").checked=false;$("approved").disabled=false;}
}
async function boot() {
  $("picker").disabled=true;$("approved").disabled=true;$("commit").disabled=true;
  $("picker").addEventListener("change",handleFile);
  $("approved").addEventListener("change",()=>{$("commit").disabled=!prepared || !prepared.ready.length || !$("approved").checked;});
  $("commit").addEventListener("click",commit);
  try {
    const session=await request("/.netlify/functions/henry-auth?action=session");
    if (!session.authenticated) throw new Error("Sign in to HENRY OS first.");
    await refreshExisting();
    $("picker").disabled=false;
    say("Signed in. Export N/ACCOUNTS Sheet1 as CSV and select it here to preview, with no changes made.");
  } catch(err){say(err.message+" Return to /admin/ and sign in.",true);}
}
if (typeof document !== "undefined") boot();
