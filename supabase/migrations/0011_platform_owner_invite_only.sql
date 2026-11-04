-- ============================================================================
-- 0011_platform_owner_invite_only.sql — invitation-only provisioning, one owner
--
-- Implements docs/adr/0005-invite-only-provisioning.md.
-- REQUIRES 0010 (memberships, role instances, invitations with role_key,
-- organizations.owner_user_id). Apply 0010 first and let its assertions pass.
--
-- STATUS: authored, NOT APPLIED.
--
-- Operator steps, in this order — 0011 deliberately refuses to commit without
-- them (§8):
--
--   1. Create the owner account WHILE PUBLIC SIGN-UP STILL WORKS (or via
--      Dashboard -> Authentication -> Users -> Add user). Record its uuid:
--         select id from auth.users where email = '<proprietress email>';
--   2. Run 0010, then run this file.
--   3. Bootstrap the platform row (§8's block is the guard; uncomment and run
--      this immediately after the migration, or fold it in by editing the
--      OWNER_UUID literal before you apply):
--         insert into public.platform (id, owner_user_id)
--         values (1, '<OWNER_UUID>')
--         on conflict (id) do update set owner_user_id = excluded.owner_user_id;
--   4. Disable public sign-up in GoTrue (Dashboard -> Authentication -> Providers,
--      or GOTRUE_DISABLE_SIGNUP for self-hosted). 0011 removes the app's ability to
--      grant tenancy; only this setting removes the door itself.
--   5. Enrol TOTP for the owner account, then verify ownership transfer and admin
--      grants still work (both require has_recent_mfa()).
--   6. Designate break-glass:
--         select public.set_break_glass_admin('<BREAK_GLASS_UUID>');
--
-- Deliberately NOT here: the deferred Edge Function. Without a service-key tier the
-- in-app UI cannot create a GoTrue user, so provisioning stays a Dashboard action
-- performed by the owner. Do not write UI copy that implies in-app account creation
-- works until supabase/functions/invite exists and asserts platform_can_manage().
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Platform ownership registry — one row, no client writes
-- ---------------------------------------------------------------------------
create table if not exists public.platform (
  id                   smallint primary key default 1 check (id = 1),
  owner_user_id        uuid not null references auth.users (id) on delete restrict,
  break_glass_user_id  uuid references auth.users (id) on delete set null,
  owner_changed_at     timestamptz not null default now(),
  updated_by           uuid references auth.users (id) on delete set null,
  constraint platform_owner_is_not_break_glass
    check (break_glass_user_id is null or break_glass_user_id <> owner_user_id)
);

-- Ownership is not a role: it cannot be granted by an admin, and it cannot be
-- changed except through the RPCs in §5. Deny-by-default, and no policy at all
-- for insert/update/delete.
alter table public.platform enable row level security;
revoke all on table public.platform from anon, authenticated;
grant select on table public.platform to authenticated;

drop policy if exists platform_member_read on public.platform;
create policy platform_member_read on public.platform
  for select using (public.is_active_member());

-- ---------------------------------------------------------------------------
-- 2. Owner helpers. Same verified-and-not-revoked discipline as 0008; a token
--    alone is never enough.
-- ---------------------------------------------------------------------------
create or replace function public.is_platform_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.platform pf
    join public.profiles p on p.id = pf.owner_user_id
    where pf.id = 1 and pf.owner_user_id = auth.uid()
      and p.verified and p.disabled_at is null
  );
$$;

create or replace function public.is_break_glass_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.platform pf
    join public.profiles p on p.id = pf.break_glass_user_id
    where pf.id = 1 and pf.break_glass_user_id = auth.uid()
      and p.verified and p.disabled_at is null
  );
$$;

-- What may be managed without being the owner. Break-glass sits here on purpose:
-- it can invite and assign clinical roles, and nothing else.
create or replace function public.platform_can_manage()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_owner() or public.is_break_glass_admin();
$$;

-- ---------------------------------------------------------------------------
-- 3. Stop granting tenancy at account creation
-- ---------------------------------------------------------------------------
-- 0001 declared org_id not null, which is what forced handle_new_user to attach
-- every signup to the first clinic. Nullable + no membership = fail closed.
alter table public.profiles alter column org_id drop not null;
alter table public.profiles alter column role set default 'reception';

-- A new account is a base identity only. No org, no requested role honoured, not
-- verified: current_org_id() is NULL and every policy denies until the owner
-- assigns a role instance.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, org_id, full_name, email, role, verified, requested_role)
  values (
    new.id,
    null,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    'reception',
    false,
    null
  );
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Single-org platform: the open self-service door is removed outright
-- ---------------------------------------------------------------------------
-- Dropped rather than gated: with one clinic there is no legitimate caller, and
-- deleting it also deletes the orphaned-organisation case from ADR-0004 §7.
drop function if exists public.create_organization(text, text);

-- request_join() stays: a request confers nothing. decide_join_request() is
-- already admin-gated and now additionally cannot hand out an admin slot to a
-- non-owner (same rule as assign_role below).

-- ---------------------------------------------------------------------------
-- 5. Owner-only authority
-- ---------------------------------------------------------------------------

-- No member of the platform may be given the admin role except by the owner, and
-- ownership changes only through this RPC, with step-up.
create or replace function public.transfer_platform_ownership(p_new_owner uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_prev uuid;
begin
  if not public.is_platform_owner() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if not public.has_recent_mfa() then
    raise exception 'STEP_UP_REQUIRED' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles
                  where id = p_new_owner and verified and disabled_at is null) then
    raise exception 'TARGET_NOT_ACTIVE' using errcode = 'P0001';
  end if;
  if p_new_owner = (select break_glass_user_id from public.platform where id = 1) then
    raise exception 'BREAK_GLASS_CANNOT_OWN' using errcode = 'P0001';
  end if;

  select owner_user_id into v_prev from public.platform where id = 1;

  update public.platform
     set owner_user_id = p_new_owner, owner_changed_at = now(), updated_by = auth.uid()
   where id = 1;

  insert into public.auth_events (org_id, user_id, event, session_id, detail)
  values (public.current_org_id(), p_new_owner, 'platform_owner_changed',
          auth.jwt()->>'session_id', jsonb_build_object('from', v_prev, 'to', p_new_owner));
  perform public.append_audit('update', 'platform', '1',
          jsonb_build_object('from', v_prev, 'to', p_new_owner)::text);
end;
$$;

create or replace function public.set_break_glass_admin(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_owner() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_user is not null and not exists (select 1 from public.profiles
                                         where id = p_user and verified and disabled_at is null) then
    raise exception 'TARGET_NOT_ACTIVE' using errcode = 'P0001';
  end if;

  update public.platform
     set break_glass_user_id = p_user, updated_by = auth.uid()
   where id = 1;

  perform public.append_audit('update', 'platform', '1',
          jsonb_build_object('break_glass_user_id', p_user)::text);
end;
$$;

-- Re-tighten the 0010 assigners: an admin (or break-glass) may assign clinical
-- roles, never the admin role, and never in another org.
create or replace function public.assign_role(p_user uuid, p_role_instance uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_org  uuid := public.current_org_id();
  v_inst public.org_role_instances%rowtype;
  v_mem  uuid;
  v_id   uuid;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;

  select * into v_inst from public.org_role_instances
   where id = p_role_instance and org_id = v_org and status = 'active';
  if not found then raise exception 'SLOT_NOT_FOUND' using errcode = 'P0001'; end if;

  if v_inst.role_key = 'admin' and not public.is_platform_owner() then
    raise exception 'ADMIN_GRANT_OWNER_ONLY' using errcode = '42501';
  end if;

  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0001';
  end if;

  insert into public.org_memberships (org_id, user_id, status, created_by)
  values (v_org, p_user, 'active', auth.uid())
  on conflict (org_id, user_id) do update set status = 'active'
  returning id into v_mem;

  begin
    insert into public.role_assignments (org_id, membership_id, role_instance_id, assigned_by)
    values (v_org, v_mem, p_role_instance, auth.uid())
    returning id into v_id;
  exception when unique_violation then
    raise exception 'ALREADY_ASSIGNED' using errcode = 'P0001';
  end;

  if exists (select 1 from public.profiles where id = p_user and active_org_id is null) then
    update public.profiles set active_org_id = v_org where id = p_user;
  end if;
  perform public.sync_legacy_profile(p_user);

  insert into public.auth_events (org_id, user_id, event, session_id, detail)
  values (v_org, p_user, 'role_assigned', auth.jwt()->>'session_id',
          jsonb_build_object('role_key', v_inst.role_key, 'label', v_inst.label));
  perform public.append_audit('update', 'role_assignments', v_id::text,
          jsonb_build_object('user_id', p_user, 'role_key', v_inst.role_key)::text);
  return v_id;
end;
$$;

-- Same rule at the invitation door, otherwise "invite as admin" is a side path to
-- the grant that assign_role just closed.
create or replace function public.invite_member(
  p_email text, p_role_key text, p_role_instance uuid default null
)
returns text language plpgsql security definer
set search_path = public, extensions as $$
declare
  v_org   uuid := public.current_org_id();
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_raw   text;
  v_id    uuid;
begin
  if not public.platform_can_manage() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_role_key = 'admin' and not public.is_platform_owner() then
    raise exception 'ADMIN_GRANT_OWNER_ONLY' using errcode = '42501';
  end if;
  if position('@' in v_email) < 2
     or position('.' in split_part(v_email, '@', 2)) < 2 then
    raise exception 'INVALID_EMAIL' using errcode = 'P0001';
  end if;
  if not public.is_valid_role(p_role_key) then
    raise exception 'INVALID_ROLE' using errcode = 'P0001';
  end if;
  if p_role_instance is not null and not exists (
    select 1 from public.org_role_instances
     where id = p_role_instance and org_id = v_org
       and status = 'active' and role_key = p_role_key
  ) then
    raise exception 'SLOT_NOT_FOUND' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.org_memberships m
      join public.profiles p on p.id = m.user_id
     where m.org_id = v_org and m.status = 'active' and lower(p.email) = v_email
  ) then
    raise exception 'ACCOUNT_ALREADY_ACTIVE' using errcode = 'P0001';
  end if;

  update public.invitations set status = 'revoked', revoked_at = now()
   where org_id = v_org and email_key = v_email and status = 'sent';

  v_raw := encode(gen_random_bytes(32), 'hex');
  insert into public.invitations
    (org_id, email, role_key, role_instance_id, token_hash, created_by, status)
  values (v_org, v_email, p_role_key, p_role_instance,
          encode(digest(v_raw, 'sha256'), 'hex'), auth.uid(), 'sent')
  returning id into v_id;

  perform public.append_audit('invite', 'invitation', v_id::text,
          jsonb_build_object('email', v_email, 'role_key', p_role_key)::text);
  return v_raw;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. The trail has to be able to record these transitions
-- ---------------------------------------------------------------------------
alter table public.auth_events drop constraint if exists auth_events_event_check;
alter table public.auth_events add constraint auth_events_event_check check (event in (
  'sign_in','mfa_ok','step_up','sign_out','lockout','access_changed','invite_accepted',
  'profile_approved','profile_updated','org_created','org_archived','ownership_transferred',
  'invite_declined','invite_revoked','role_assigned','role_revoked','membership_suspended',
  'join_requested','platform_owner_changed'));

-- ---------------------------------------------------------------------------
-- 7. Break-glass must be reachable in principle, not in practice
-- ---------------------------------------------------------------------------
-- admin@www.clinic already had its password replaced with an in-database random
-- hash on 2026-11-03 (see docs/risk-register.md). Recovery procedure, in order:
--   1. Dashboard -> Authentication -> Users -> admin@www.clinic -> set new password.
--   2. Sign in, enrol TOTP, then assign the roles that need assigning.
--   3. Hand control back: the owner account is re-established with
--      select public.transfer_platform_ownership('<owner uuid>');  -- needs step-up
--   4. Clear the exception: select public.set_break_glass_admin(null);
-- No credential for it is stored in this repository. If you add one, it stops
-- being break-glass and becomes the shared-credential finding again.

-- ---------------------------------------------------------------------------
-- 8. Assertions — refuse to commit half-locked-down
-- ---------------------------------------------------------------------------
do $$
declare
  v_rows        int;
  v_owner_bad   int;
  v_unassigned  int;
begin
  select count(*) into v_rows from public.platform;
  if v_rows <> 1 then
    raise exception
      'PLATFORM_BOOTSTRAP_REQUIRED: expected exactly 1 platform row, found %. '
      'Run the insert from this file''s header step 3, then re-apply.', v_rows
      using errcode = 'P0001';
  end if;

  select count(*) into v_owner_bad
    from public.platform pf
    left join public.profiles p on p.id = pf.owner_user_id
   where pf.id = 1
     and (p.id is null or not p.verified or p.disabled_at is not null);
  if v_owner_bad > 0 then
    raise exception 'PLATFORM_OWNER_NOT_ACTIVE' using errcode = 'P0001';
  end if;

  -- Accounts with no active membership are the people this migration silences.
  -- They are legitimate (invited, not yet assigned) but must be a known list.
  select count(*) into v_unassigned
    from public.profiles p
   where p.verified and p.disabled_at is null
     and not exists (select 1 from public.org_memberships m
                      where m.user_id = p.id and m.status = 'active');
  if v_unassigned > 0 then
    raise notice 'NOTICE: % verified account(s) have no membership and will read 0 rows',
      v_unassigned;
  end if;
end;
$$;

-- Expected after apply, on zdtaludwhxnjutosrnvi:
--   platform: 1 row, owner = the proprietor's new account, break_glass = admin uuid.
--   profiles: michaelnnamdi62@gmail.com keeps org_id/role as a cache and an active
--             membership + Doctor-n slot; the four revoked seeded accounts stay
--             disabled; any future account arrives with org_id NULL and no
--             membership until invited.
--   create_organization(): gone (42883). invite_member('x','admin') as break-glass:
--             ADMIN_GRANT_OWNER_ONLY. transfer_platform_ownership() without a fresh
--             TOTP amr: STEP_UP_REQUIRED.
