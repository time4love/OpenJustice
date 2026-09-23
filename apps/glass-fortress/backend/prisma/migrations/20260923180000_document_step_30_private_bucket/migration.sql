-- ---------------------------------------------------------------------------
-- DOCUMENT REFACTOR STEP 30 — THE RESEARCHER'S BUCKET, ONE PER ENVIRONMENT.
--
-- `docs/gf-document-flows.md` §12 :1185: ONE PRIVATE BUCKET per environment, in the same
-- Supabase project as that environment's database, objects keyed by DOC_ID, NO PUBLIC READ.
-- Created here so that it DEPLOYS ITSELF before the code that needs it serves, on every
-- environment, with nobody remembering a dashboard step (CLAUDE.md: prefer changing the
-- pipeline over acquiring a credential).
--
-- WHAT THIS FILE DOES NOT TOUCH: the legacy `evidence` bucket, which exists on staging,
-- PUBLIC, holding one object from 2026-08-20. It is not this step's and is not reused.
--
-- `db:check-drift` CANNOT SEE THIS: the datasource models `public` only. The LAND
-- post-condition therefore reads `storage.buckets` from the database: the row exists,
-- `public = false`, `file_size_limit = 52428800`.
--
-- ON CONFLICT DO NOTHING (the ruling). Its one hazard, named: a PRE-EXISTING 'documents'
-- bucket that is PUBLIC would survive this statement unchanged. Staging holds none today
-- (read 2026-09-23: the only bucket is `evidence`); production is read at SHIP before this
-- deploys. The LAND read above is what catches it either way.
--
-- `file_size_limit` = 50 MiB, TOO_LARGE (ruled 50 MB). It makes the STORAGE refuse a
-- larger upload to a signed URL, which the route's own byteLength check cannot. It is the
-- second spelling of one number, so a test reads this file and holds it EQUAL to the one
-- TypeScript constant. `allowed_mime_types` is deliberately NOT set: the accepted types
-- have ONE spelling (`add_document`'s accepted set, which UNSUPPORTED_TYPE reads), and a
-- list here would be a second one that can drift.
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('documents', 'documents', false, 52428800)
ON CONFLICT (id) DO NOTHING;
