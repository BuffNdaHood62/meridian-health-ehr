-- ============================================================================
-- 0009_crypto_search_path_fix.sql — the audit trail cannot be written on a
-- hosted project. Forward fix for a defect in 0007/0008.
--
-- Found 2026-10-26 on zdtaludwhxnjutosrnvi while dry-running approve_profile
-- for the go-live runbook:
--
--   ERROR: 42883: function digest(text, unknown) does not exist
--   QUERY: new.row_hash := encode(digest(v_payload, 'sha256'), 'hex')
--   CONTEXT: PL/pgSQL function chain_audit_hash() line 18 at assignment
--            ... append_audit(...) ... approve_profile(...)
--
-- Cause: every function in 0007/0008 pins `set search_path = public`, which is
-- correct hygiene, but Supabase installs pgcrypto into the `extensions` schema
-- (verified: pg_extension -> namespaces gives schema 'extensions', and
-- 'digest' is not present in public). So digest() and gen_random_bytes() are
-- unresolvable inside those functions.
--
-- Blast radius — this is not a corner case:
--   * chain_audit_hash() is the BEFORE trigger on every audit_log insert, so
--     EVERY audit write fails. That means append_audit() (which src/data/api.ts
--     calls for each audited action in backend mode), approve_profile,
--     set_profile_role, set_profile_access, update_my_profile, the
--     www_demographics_audit and org_security_settings_audit triggers, and any
--     other path that logs — all error out.
--   * create_invitation() additionally calls gen_random_bytes(32).
--   * accept_invitation() looks tokens up by digest().
--
-- Fix: widen the search_path of exactly those three functions to
-- `public, extensions`. Bodies are untouched, so the hashing and the
-- privilege handling stay identical. `public` stays first, and on a hosted
-- project `extensions` is not writable by anon/authenticated.
--
-- Alternative considered: replace digest(x,'sha256') with the built-in
-- sha256(x::bytea) (PostgreSQL 15+, this project is on 17.6) and drop the
-- pgcrypto dependency from the hash chain entirely. That is the better long-term
-- shape but it rewrites the audit-hash function, so it is deliberately not
-- combined with an emergency fix.
--
-- STATUS: APPLIED to zdtaludwhxnjutosrnvi on 2026-10-26. Verified: `proconfig`
-- reads `search_path=public, extensions` for all three functions, and
-- approve_profile() then wrote its audit_log row (row_hash computed, prev_hash
-- NULL as the chain's first link). Re-run the §6 probes in GO-LIVE-RUNBOOK.md on
-- any other project after applying.
-- ============================================================================

alter function public.chain_audit_hash()   set search_path = public, extensions;
alter function public.create_invitation(text, text)
                                           set search_path = public, extensions;
alter function public.accept_invitation(text)
                                           set search_path = public, extensions;

-- Post-apply check (must return 'public,extensions' for all three rows):
--   select p.oid::regprocedure::text, array_to_string(p.proconfig, ',')
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.proname in ('chain_audit_hash','create_invitation','accept_invitation');
