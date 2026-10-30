# HENRY OS — owner authentication setup checklist

Owner login email: ahdesignai@gmail.com
Planned route: https://amcshopping.com/admin/
Status: source code staged on feature branch; NOT deployed; NO owner account has been created.

1. Create a dedicated Supabase project owned by the business. Store credentials in the owner's password manager; enable MFA on Supabase admin.
2. Run and review henry-os/schema.sql in the Supabase SQL editor. It creates the henry_is_owner() RPC and owner-only RLS tables. Confirm policy behavior before production use.
3. Create the owner in Supabase Auth with the verified email above. Set a private password through a secure invite or password-recovery process. Never put passwords in GitHub.
4. Provision the owner UUID in henry_owner_users using a privileged SQL/admin session only, after verifying the auth user ID and email. Example (replace the UUID):
   insert into public.henry_owner_users (user_id, email) values ('OWNER_AUTH_UUID', 'ahdesignai@gmail.com');
   Verify exact schema columns before executing.
5. Enable and enforce MFA for owner sign-in. IMPORTANT: the current web shell does NOT yet implement an MFA challenge; do not launch before adding/testing it.
6. Populate admin/config.js at build time with the Supabase project URL and publishable/anon key (NOT service_role). A publishable key is safe in client code; a service role key is NOT.
7. Configure Supabase allowed redirect URLs to include https://amcshopping.com/admin/.
8. Test wrong email, wrong password, unprovisioned user, password recovery, MFA, logout, expired session, mobile layout and RLS bypass attempts.
9. Integrate admin app into the ZIP/injector build under /admin/ only after all checks pass. No public menu/sitemap links; noindex. Hidden URL is not a security boundary.
10. Do not deploy the unfinished dashboard or publish sensitive data.

Implementation note: Current app.js loads supabase-js from esm.sh. For production, pin dependency and preferably bundle locally, set CSP, and test availability.

Delivery requests on the live site currently open WhatsApp; they do not yet sync to the Henry OS database.
