-- ============================================================================
-- 0008_identity_hardening.sql — identity is server-authoritative
--
-- Decisions this implements (2026-10-26):
--   * Identity provider stays Supabase GoTrue (no custom auth service).
--   * Second factor is TOTP first (GoTrue MFA); the AAL2 claim is the gate.
--   * The "doctor code" stays a per-screen view lock (ADR-0002), never a
--     second factor. It is not referenced by any policy here.
--
-- Defects closed:
--   1. Self-service privilege escalation. `handle_new_user()` copied
--      `raw_user_meta_data->>'role'` straight into profiles.role, and the
--      `profiles_self` policy was `for all using (id = auth.uid())` — so a
--      signed-in user could PATCH their own row to role='admin' (or move
--      org_id to another tenant). Signup now grants the least-privileged role
--      and only records *requested_role*; role changes are admin RPCs.
--   2. `verified` was UI-only. `current_org_id()`/`is_admin()` ignored it, so
--      RLS served data to unapproved accounts, and a revoked profile kept
--      working until its JWT expired. Every helper now requires
--      `verified and disabled_at is null`; revocation takes effect on the next
--      query, not on the next token refresh (the token stays valid but grants
--      nothing).
--   3. Step-up was client-only. `RouteAuthenticationGate` returns <Outlet/>
--      whenever Supabase is configured, so the 8-hour check had no server
--      counterpart. Order authoring/administration now requires GoTrue AAL2
--      with a recent TOTP amr timestamp, validated in SQL.
--   4. Admin-chosen roles had no path that did not trust the client. Added
--      single-use, email-bound invitations and a synchronous auth_events trail.
--
-- REQUIRES 0007 (role_allows, forbid_mutation, registry tables). Apply 0007
-- first. STATUS: authored, NOT APPLIED — no Postgres/Supabase CLI in this
-- environment. Run on staging and execute the assertion block at the bottom.
--
-- GoTrue settings this migration assumes (configure in Dashboard, not SQL):
--   * Confirm email = ON (a session without a confirmed email must not exist).
--   * MFA TOTP = ON. The challenge and step-up screens exist
--     (`/login/mfa`, `/login/step-up`, `src/identity/supabase-adapter.ts`), but
--     there is NO enrolment UI: this migration makes the server gate exist, it
--     does not give users a way to enrol a factor. Do not apply to an org that
--     needs to author orders until a factor has been enrolled manually or an
--     enrolment screen is shipped.
--   * Rate limiting stays GoTrue's job. The client's 5-attempt doctor-code
--     lockout is a UX affordance and is NOT a server-side login lockout;
--     failed password attempts never reach this database, so `auth_events`
--     records successful transitions only. Do not claim otherwise.
--   * Deleting auth.sessions from SQL is intentionally not done (unsupported
--     internals). `set_profile_access(..., false)` is the revocation control.
--
-- Bootstrap (fresh project): no verified admin exists yet, so the first admin
-- must be set directly in the SQL editor:
--   update public.profiles set role='admin', verified=true
--    where id = (select id from auth.users where email='<admin email>');
-- Subsequent grants go through approve_profile().
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Profile state + org security setting
-- ---------------------------------------------------------------------------

-- What the user asked for at signup. Advisory only; an admin must approve.
alter table public.profiles
  add column if not exists requested_role text,
  add column if not exists disabled_at timestamptz;

alter table public.profiles drop constraint if exists profiles_requested_role_check;
alter table public.profiles add constraint profiles_requested_role_check
  check (requested_role is null or requested_role in ('doctor','nurse','reception','admin','lab'));

-- Deny-by-default: an org that has not enrolled TOTP cannot author orders.
-- Downgrading this is itself a step-up-protected, audited action (trigger §8).
alter table public.organizations
  add column if not exists require_step_up_for_orders boolean not null default true;

-- ---------------------------------------------------------------------------
-- 2. Identity tables
-- ---------------------------------------------------------------------------

-- Admin-created, email-bound, single-use. Only the SHA-256 of the token is
-- stored; the raw token is returned once by create_invitation().
create table if not exists public.invitations (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  email         text not null,
  email_key     text generated always as (lower(btrim(email))) stored,
  role          text not null check (role in ('doctor','nurse','reception','admin','lab')),
  token_hash    text not null unique,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default now() + interval '7 days',
  accepted_at   timestamptz,
  accepted_by   uuid references auth.users (id) on delete set null,
  revoked_at    timestamptz
);

-- At most one live invitation per email per org; a re-invite revokes the old.
create unique index if not exists invitations_live_email_idx
  on public.invitations (org_id, email_key)
  where accepted_at is null and revoked_at is null;
create index if not exists invitations_org_idx on public.invitations (org_id, created_at desc);

-- Synchronous identity transitions. NO org FK on purpose: the trail must
-- outlive an org re-org, and it is evidence, not relational data.
create table if not exists public.auth_events (
  id          bigserial primary key,
  org_id      uuid,
  user_id     uuid references auth.users (id) on delete set null,
  event       text not null check (event in (
                'sign_in','mfa_ok','step_up','sign_out','lockout',
                'access_changed','invite_accepted','profile_approved','profile_updated')),
  session_id  text,
  user_agent  text,
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists auth_events_user_idx on public.auth_events (user_id, created_at desc);

-- Append-only, same enforcement as 0007's audit_log.
drop trigger if exists auth_events_immutable on public.auth_events;
create trigger auth_events_immutable
  before update or delete on public.auth_events
  for each row execute function public.forbid_mutation();

-- ---------------------------------------------------------------------------
-- 3. Invariant helpers (smallest pieces first)
-- ---------------------------------------------------------------------------

create or replace function public.is_valid_role(p_role text)
returns boolean
language sql
immutable
as $$
  select p_role in ('doctor','nurse','reception','admin','lab');
$$;

-- Single definition of "may this account read anything at all".
create or replace function public.is_active_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and verified and disabled_at is null
  );
$$;

-- Verified + not revoked. An unverified or disabled profile resolves to null,
-- so every org-bounded RLS predicate fails closed.
create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from public.profiles
  where id = auth.uid() and verified and disabled_at is null;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and verified and disabled_at is null
  );
$$;

-- 0004's helper is still called by nothing after 0007, but keep it consistent
-- so a future policy cannot reintroduce the unverified hole through it.
create or replace function public.role_can(p_entity text, p_action text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when (select role from public.profiles
           where id = auth.uid() and verified and disabled_at is null) = 'reception'
      then p_entity in ('patients', 'messages')
    when (select role from public.profiles
           where id = auth.uid() and verified and disabled_at is null) = 'lab'
      then p_entity in ('patients', 'labs', 'orders', 'messages')
    else true
  end;
$$;

create or replace function public.role_allows(p_entity text, p_action text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    (select role from public.profiles
      where id = auth.uid() and verified and disabled_at is null)

    when 'doctor' then p_action in ('select','insert','update')

    when 'nurse' then
      p_action = 'select'
      or (p_entity in ('order_administrations','vitals','notes','messages','alerts') and p_action = 'insert')
      or (p_entity = 'orders' and p_action = 'update')

    when 'lab' then
      p_action = 'select'
      or (p_entity in ('labs','messages') and p_action = 'insert')
      or (p_entity = 'labs' and p_action = 'update')

    when 'reception' then
      p_action = 'select'
      or (p_entity in ('www_clients','www_client_visits','www_client_demographics','appointments','messages','shares') and p_action = 'insert')
      or (p_entity in ('www_client_demographics','appointments','patients') and p_action = 'update')

    when 'admin' then
      p_action = 'select'
      or (p_entity in ('profiles','organizations','www_number_counters') and p_action in ('insert','update'))

    else false
  end;
$$;

-- GoTrue sets aal='aal2' only after a second factor. The amr array carries the
-- method + unix timestamp per authentication event; we require a recent totp
-- (or webauthn) entry. Missing/unparseable amr fails closed.
create or replace function public.has_recent_mfa(p_max_age_seconds int default 28800)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_claims jsonb := auth.jwt();
  v_amr    jsonb;
  v_entry  jsonb;
  v_last   bigint := 0;
begin
  if v_claims is null or coalesce(v_claims->>'aal', '') <> 'aal2' then
    return false;
  end if;

  v_amr := v_claims->'amr';
  if v_amr is null or jsonb_typeof(v_amr) <> 'array' then
    return false;
  end if;

  for v_entry in select value from jsonb_array_elements(v_amr) loop
    if coalesce(v_entry->>'method', '') in ('totp', 'webauthn')
       and coalesce(v_entry->>'timestamp', '') ~ '^[0-9]+$' then
      v_last := greatest(v_last, (v_entry->>'timestamp')::bigint);
    end if;
  end loop;

  if v_last = 0 then
    return false;
  end if;
  return now() <= to_timestamp(v_last) + make_interval(secs => greatest(p_max_age_seconds, 60));
end;
$$;

-- Missing org (degenerate state) resolves to true: fail closed.
create or replace function public.orders_step_up_required()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select require_step_up_for_orders from public.organizations where id = public.current_org_id()),
    true
  );
$$;

-- ---------------------------------------------------------------------------
-- 4. Signup no longer chooses its own role
-- ---------------------------------------------------------------------------
-- The metadata role is recorded as requested_role for admin review; the
-- account starts as 'reception' (the least-privileged role in this model) and
-- unverified, so it can read nothing until approved. Direct SQL bootstrap runs
-- with auth.uid() = null and sets roles explicitly (see header).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org       uuid;
  v_requested text := new.raw_user_meta_data->>'role';
begin
  select id into v_org from public.organizations order by created_at limit 1;
  insert into public.profiles (id, org_id, full_name, email, role, verified, requested_role)
  values (
    new.id,
    coalesce(v_org, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    'reception',
    false,
    case when public.is_valid_role(v_requested) then v_requested end
  );
  return new;
end;
$$;

-- Defense-in-depth: even if a future policy accidentally grants UPDATE on
-- profiles, a non-admin cannot move org, change role/verification, or change
-- email. SECURITY DEFINER RPCs in this file set
-- app.identity_privileged='on' (transaction-local); no client-callable path can
-- set that GUC through PostgREST. Updating full_name stays allowed.
create or replace function public.guard_profile_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('app.identity_privileged', true), 'off') = 'on' then
    return new;
  end if;
  if auth.uid() is null then
    return new;  -- SQL/console/service path
  end if;

  if new.org_id is distinct from old.org_id or new.id is distinct from old.id then
    raise exception 'ORG_MOVE_FORBIDDEN' using errcode = '42501';
  end if;

  if new.role is distinct from old.role
     or new.verified is distinct from old.verified
     or new.disabled_at is distinct from old.disabled_at
     or new.email is distinct from old.email then
    if not public.is_admin() then
      raise exception 'PROFILE_FIELDS_ADMIN_ONLY' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.guard_profile_mutation();

-- ---------------------------------------------------------------------------
-- 5. Profile RPCs (the only write paths a client has)
-- ---------------------------------------------------------------------------

create or replace function public.update_my_profile(p_full_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_full_name, ''));
begin
  if not public.is_active_member() then
    raise exception 'ACCOUNT_NOT_ACTIVE' using errcode = '42501';
  end if;
  if length(v_name) < 2 or length(v_name) > 120 then
    raise exception 'INVALID_NAME' using errcode = 'P0001';
  end if;

  update public.profiles set full_name = v_name where id = auth.uid();

  insert into public.auth_events (org_id, user_id, event, session_id, detail)
  values (public.current_org_id(), auth.uid(), 'profile_updated', auth.jwt()->>'session_id',
          jsonb_build_object('field', 'full_name'));

  perform public.append_audit('update', 'profile', auth.uid()::text, 'display name changed');
end;
$$;

-- Approve a pending account and set its role. p_role = null falls back to the
-- role the user requested at signup, then to the current role.
create or replace function public.approve_profile(p_user_id uuid, p_role text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org    uuid := public.current_org_id();
  v_target public.profiles%rowtype;
  v_role   text;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_target from public.profiles where id = p_user_id and org_id = v_org;
  if not found then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_role := coalesce(p_role, v_target.requested_role, v_target.role);
  if not public.is_valid_role(v_role) then
    raise exception 'INVALID_ROLE' using errcode = 'P0001';
  end if;

  perform set_config('app.identity_privileged', 'on', true);
  update public.profiles
     set role = v_role, verified = true, disabled_at = null
   where id = p_user_id;
  perform set_config('app.identity_privileged', 'off', true);

  insert into public.auth_events (org_id, user_id, event, session_id, detail)
  values (v_org, p_user_id, 'profile_approved', auth.jwt()->>'session_id',
          jsonb_build_object('from_role', v_target.role, 'to_role', v_role));

  perform public.append_audit('approve', 'profile', p_user_id::text,
    jsonb_build_object('from_role', v_target.role, 'to_role', v_role, 'verified', true)::text);
end;
$$;

create or replace function public.set_profile_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org    uuid := public.current_org_id();
  v_target public.profiles%rowtype;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if not public.is_valid_role(p_role) then
    raise exception 'INVALID_ROLE' using errcode = 'P0001';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'CANNOT_CHANGE_OWN_ROLE' using errcode = '42501';
  end if;

  select * into v_target from public.profiles where id = p_user_id and org_id = v_org;
  if not found then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_target.role = 'admin' and p_role <> 'admin'
     and v_target.verified and v_target.disabled_at is null then
    if (select count(*) from public.profiles
         where org_id = v_org and role = 'admin' and verified and disabled_at is null) <= 1 then
      raise exception 'LAST_ADMIN' using errcode = 'P0001';
    end if;
  end if;

  perform set_config('app.identity_privileged', 'on', true);
  update public.profiles set role = p_role where id = p_user_id;
  perform set_config('app.identity_privileged', 'off', true);

  perform public.append_audit('update', 'profile', p_user_id::text,
    jsonb_build_object('from_role', v_target.role, 'to_role', p_role)::text);
end;
$$;

-- Revoke or restore an already-approved account. Revocation does not delete the
-- auth user or its session: it flips disabled_at, and every RLS predicate goes
-- through current_org_id()/role_allows(), both of which now require
-- disabled_at is null. Effective on the next query.
create or replace function public.set_profile_access(p_user_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org    uuid := public.current_org_id();
  v_target public.profiles%rowtype;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() and not p_active then
    raise exception 'CANNOT_DISABLE_SELF' using errcode = '42501';
  end if;

  select * into v_target from public.profiles where id = p_user_id and org_id = v_org;
  if not found then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not p_active and v_target.role = 'admin' and v_target.verified and v_target.disabled_at is null then
    if (select count(*) from public.profiles
         where org_id = v_org and role = 'admin' and verified and disabled_at is null) <= 1 then
      raise exception 'LAST_ADMIN' using errcode = 'P0001';
    end if;
  end if;

  perform set_config('app.identity_privileged', 'on', true);
  update public.profiles
     set verified = case when p_active then true else verified end,
         disabled_at = case when p_active then null else now() end
   where id = p_user_id;
  perform set_config('app.identity_privileged', 'off', true);

  insert into public.auth_events (org_id, user_id, event, session_id, detail)
  values (v_org, p_user_id, 'access_changed', auth.jwt()->>'session_id',
          jsonb_build_object('active', p_active));

  perform public.append_audit(case when p_active then 'activate' else 'revoke' end,
    'profile', p_user_id::text, jsonb_build_object('active', p_active)::text);
end;
$$;

-- 0002 kept this name; route it through approval so a verify can never grant
-- admin without an explicit role decision.
create or replace function public.verify_profile(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.approve_profile(p_user_id, null);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Invitation RPCs
-- ---------------------------------------------------------------------------

-- Returns the raw token ONCE. Hand it to the invitee out-of-band; only the hash
-- is stored. Caller must be a verified admin in the org.
create or replace function public.create_invitation(p_email text, p_role text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org   uuid := public.current_org_id();
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_raw   text;
  v_id    uuid;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if position('@' in v_email) < 2 or position('.' in split_part(v_email, '@', 2)) < 2 then
    raise exception 'INVALID_EMAIL' using errcode = 'P0001';
  end if;
  if not public.is_valid_role(p_role) then
    raise exception 'INVALID_ROLE' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.profiles
    where org_id = v_org and lower(email) = v_email and verified and disabled_at is null
  ) then
    raise exception 'ACCOUNT_ALREADY_ACTIVE' using errcode = 'P0001';
  end if;

  -- Re-inviting supersedes the previous live token.
  update public.invitations set revoked_at = now()
   where org_id = v_org and email_key = v_email
     and accepted_at is null and revoked_at is null;

  v_raw := encode(gen_random_bytes(32), 'hex');
  insert into public.invitations (org_id, email, role, token_hash, created_by)
  values (v_org, v_email, p_role, encode(digest(v_raw, 'sha256'), 'hex'), auth.uid())
  returning id into v_id;

  perform public.append_audit('invite', 'invitation', v_id::text,
    jsonb_build_object('email', v_email, 'role', p_role)::text);

  return v_raw;
end;
$$;

-- Bound to the signed-in account's email. A forwarded token cannot be redeemed
-- by someone else. Sets org + role + verified in one transaction.
create or replace function public.accept_invitation(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt()->>'email', ''));
  v_inv   public.invitations%rowtype;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if p_token is null or length(p_token) < 32 then
    raise exception 'INVALID_INVITATION' using errcode = 'P0001';
  end if;

  select * into v_inv from public.invitations
   where token_hash = encode(digest(p_token, 'sha256'), 'hex')
     and accepted_at is null and revoked_at is null and expires_at > now()
   for update;

  if not found then
    raise exception 'INVALID_INVITATION' using errcode = 'P0001';
  end if;
  if v_email = '' or v_inv.email_key <> v_email then
    raise exception 'INVITATION_EMAIL_MISMATCH' using errcode = '42501';
  end if;

  perform set_config('app.identity_privileged', 'on', true);
  update public.profiles
     set org_id = v_inv.org_id, role = v_inv.role, verified = true, disabled_at = null
   where id = v_uid;
  perform set_config('app.identity_privileged', 'off', true);
  if not found then
    raise exception 'PROFILE_MISSING' using errcode = 'P0001';
  end if;

  update public.invitations
     set accepted_at = now(), accepted_by = v_uid
   where id = v_inv.id;

  insert into public.auth_events (org_id, user_id, event, session_id, detail)
  values (v_inv.org_id, v_uid, 'invite_accepted', auth.jwt()->>'session_id',
          jsonb_build_object('invitation_id', v_inv.id, 'role', v_inv.role));

  perform public.append_audit('approve', 'profile', v_uid::text,
    jsonb_build_object('via', 'invitation', 'invitation_id', v_inv.id, 'role', v_inv.role)::text);

  return jsonb_build_object('org_id', v_inv.org_id, 'role', v_inv.role);
end;
$$;

create or replace function public.revoke_invitation(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_org_id();
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  update public.invitations set revoked_at = now()
   where id = p_id and org_id = v_org and accepted_at is null and revoked_at is null;
  if not found then
    raise exception 'INVITATION_NOT_FOUND' using errcode = 'P0001';
  end if;

  perform public.append_audit('revoke', 'invitation', p_id::text, null);
end;
$$;

-- Client-reported auth transitions (successful ones only — see header). The
-- allow-list keeps server-only event types out of client hands.
create or replace function public.log_auth_event(p_event text, p_detail jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_detail jsonb := coalesce(p_detail, '{}'::jsonb);
  v_ua     text;
  v_org    uuid;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if p_event not in ('sign_in','mfa_ok','step_up','sign_out','lockout') then
    raise exception 'INVALID_AUTH_EVENT' using errcode = 'P0001';
  end if;
  if length(v_detail::text) > 2000 then
    raise exception 'DETAIL_TOO_LARGE' using errcode = 'P0001';
  end if;

  select org_id into v_org from public.profiles where id = v_uid;

  begin
    v_ua := (current_setting('request.headers', true)::jsonb)->>'user-agent';
  exception when others then
    v_ua := null;
  end;

  insert into public.auth_events (org_id, user_id, event, session_id, user_agent, detail)
  values (v_org, v_uid, p_event, auth.jwt()->>'session_id', v_ua, v_detail);
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Policies
-- ---------------------------------------------------------------------------

-- Profiles are read-only to clients; every write is an RPC above. This removes
-- the `for all` self-policy that allowed role/org self-escalation.
drop policy if exists profiles_self      on public.profiles;
drop policy if exists profiles_admin     on public.profiles;
drop policy if exists profiles_self_read on public.profiles;
drop policy if exists profiles_admin_read on public.profiles;

create policy profiles_self_read on public.profiles
  for select to authenticated
  using (id = auth.uid());

create policy profiles_admin_read on public.profiles
  for select to authenticated
  using (org_id = public.current_org_id() and public.is_admin());

-- Invitations: admins may list their org's; create/revoke are RPC-only.
alter table public.invitations enable row level security;
drop policy if exists invitations_admin_read on public.invitations;
create policy invitations_admin_read on public.invitations
  for select to authenticated
  using (org_id = public.current_org_id() and public.is_admin());

-- Auth trail: own events or org admins; inserts are RPC-only.
alter table public.auth_events enable row level security;
drop policy if exists auth_events_read on public.auth_events;
create policy auth_events_read on public.auth_events
  for select to authenticated
  using (user_id = auth.uid() or (org_id = public.current_org_id() and public.is_admin()));

-- Server-side step-up for clinical writes that create or change orders, and for
-- medication administration events. Same org bound as 0007; adds the AAL2 gate.
drop policy if exists orders_write on public.orders;
create policy orders_write on public.orders
  for insert with check (
    public.role_allows('orders','insert')
    and exists (select 1 from public.patients p
                 where p.id = patient_id and p.org_id = public.current_org_id())
    and (not public.orders_step_up_required() or public.has_recent_mfa())
  );

drop policy if exists orders_update on public.orders;
create policy orders_update on public.orders
  for update using (
    public.role_allows('orders','update')
    and exists (select 1 from public.patients p
                 where p.id = patient_id and p.org_id = public.current_org_id())
    and (not public.orders_step_up_required() or public.has_recent_mfa())
  );

drop policy if exists admin_write on public.order_administrations;
create policy admin_write on public.order_administrations
  for insert with check (
    org_id = public.current_org_id()
    and public.role_allows('order_administrations','insert')
    and (not public.orders_step_up_required() or public.has_recent_mfa())
  );

-- ---------------------------------------------------------------------------
-- 8. Org security settings: downgrade needs step-up, every change is audited
-- ---------------------------------------------------------------------------

create or replace function public.guard_org_security_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.require_step_up_for_orders and not new.require_step_up_for_orders then
    if auth.uid() is not null and not public.has_recent_mfa() then
      raise exception 'STEP_UP_REQUIRED' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists org_security_settings_guard on public.organizations;
create trigger org_security_settings_guard
  before update on public.organizations
  for each row execute function public.guard_org_security_settings();

create or replace function public.audit_org_security_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.require_step_up_for_orders is distinct from old.require_step_up_for_orders then
    insert into public.audit_log (org_id, actor_id, action, entity, entity_id, detail)
    values (new.id, auth.uid(), 'update', 'organizations', new.id::text,
            jsonb_build_object('require_step_up_for_orders', new.require_step_up_for_orders)::text);
  end if;
  return new;
end;
$$;

drop trigger if exists org_security_settings_audit on public.organizations;
create trigger org_security_settings_audit
  after update on public.organizations
  for each row execute function public.audit_org_security_settings();

-- ---------------------------------------------------------------------------
-- 9. Grants
-- ---------------------------------------------------------------------------
-- New tables are read via RLS only; all writes are SECURITY DEFINER RPCs.
revoke insert, update, delete, truncate on public.invitations from anon, authenticated;
revoke insert, update, delete, truncate on public.auth_events from anon, authenticated;
grant select on public.invitations, public.auth_events to authenticated;

-- Profile writes are RPC-only. Reads stay granted (0007) and RLS-scoped.
revoke insert, update, delete, truncate on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;

-- Mutating identity RPCs: authenticated only. Helpers stay EXECUTE-able by
-- PUBLIC because policy expressions run with the caller's privileges.
revoke execute on function public.update_my_profile(text) from public, anon;
revoke execute on function public.approve_profile(uuid, text) from public, anon;
revoke execute on function public.set_profile_role(uuid, text) from public, anon;
revoke execute on function public.set_profile_access(uuid, boolean) from public, anon;
revoke execute on function public.create_invitation(text, text) from public, anon;
revoke execute on function public.accept_invitation(text) from public, anon;
revoke execute on function public.revoke_invitation(uuid) from public, anon;
revoke execute on function public.log_auth_event(text, jsonb) from public, anon;
revoke execute on function public.verify_profile(uuid) from public, anon;
-- Audit stays callable by signed-in clients (the actor is stamped server-side),
-- but anon has no identity to stamp and no business writing rows.
revoke execute on function public.append_audit(text, text, text, text) from public, anon;

grant execute on function public.update_my_profile(text) to authenticated;
grant execute on function public.approve_profile(uuid, text) to authenticated;
grant execute on function public.set_profile_role(uuid, text) to authenticated;
grant execute on function public.set_profile_access(uuid, boolean) to authenticated;
grant execute on function public.create_invitation(text, text) to authenticated;
grant execute on function public.accept_invitation(text) to authenticated;
grant execute on function public.revoke_invitation(uuid) to authenticated;
grant execute on function public.log_auth_event(text, jsonb) to authenticated;
grant execute on function public.verify_profile(uuid) to authenticated;
grant execute on function public.append_audit(text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 10. RLS-matrix assertions (run manually on staging)
-- ---------------------------------------------------------------------------
-- Helper to impersonate a user in a transaction:
--   begin;
--   set local role authenticated;
--   set local request.jwt.claims =
--     '{"sub":"<uuid>","email":"<email>","role":"authenticated","aal":"aal1"}';
--
-- Expect 0 / error for each:
--   select count(*) from patients;                          -- unverified -> 0
--   update profiles set role='admin' where id=auth.uid();   -- 42501 (no policy)
--   insert into orders(patient_id,name,type,detail,priority)
--     values ('<pid>','x','Laboratory','x','Routine');      -- 42501 step-up
--   select * from invitations;                              -- non-admin -> 0 rows
--   reset role; rollback;
--
-- Same claims but with amr, then the order insert must succeed:
--   '{"sub":"<doctor>","email":"...","role":"authenticated","aal":"aal2",
--     "amr":[{"method":"totp","timestamp":<unix-now>}]}'
--
-- Admin path: call approve_profile('<uuid>', 'doctor'); then the target's
-- current_org_id() is non-null on its next query. Call set_profile_access
-- ('<uuid>', false); the target reads 0 patients immediately without needing a
-- new token. Attempt the same update as the target -> 42501.
--
-- Invitation path: create_invitation returns raw token; redeem as the matching
-- email -> role/org set; redeem again -> INVALID_INVITATION; redeem as a
-- different email -> INVITATION_EMAIL_MISMATCH.
--
-- Note: `select count(*) from patients` for an unverified user returns 0 (RLS
-- filters), not an error — that is the intended fail-closed behaviour.
