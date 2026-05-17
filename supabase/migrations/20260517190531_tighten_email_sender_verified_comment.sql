-- Issue 7 from M2 Fase 1a final review: clarify that
-- email_sender_verified_at must only be set after Resend confirms DNS
-- verification, never by hand from an admin UI or directly via SQL.
--
-- Setting verified_at without actual Resend verification would cause
-- sendEmail to attempt to use the unverified address, Resend would
-- reject the email with 4xx, and every email from that tenant would
-- silently fail (or be flagged as email_warning in approve-worker).
--
-- The future white-label config UI (deferred to M3+) is the only path
-- that should set this column. Until then it should remain NULL for
-- all tenants.

comment on column public.companies.email_sender_verified_at is
  'Timestamp when Resend confirmed DNS verification of email_sender_domain. CRITICAL: must only be populated by a verified Resend webhook or a trusted admin tool that confirms verification via Resend API. Setting this manually without actual Resend DNS verification will cause silent email send failures (Resend rejects unverified senders). NULL = not verified; sendEmail falls back to shared sender.';
