-- ============================================================================
-- 0011_platform_owners_invite_only.sql — co-owned platform, invite-link provisioning
--
-- Implements docs/adr/0005-invite-only-provisioning.md (as amended 2026-11-05).
-- REQUIRES 0010 (applied 2026-11-05): memberships, role instances,
-- role_permissions, invitations with role_key.
--
-- Two decisions shape this file:
--   * Platform ownership is a SET, not a column: two owners
--     (wellnesswithwritingale@gmail.com, michaelnnamdi62@gmail.com).
--   * Invitees are created by GoTrue's native INVITE link and set their own
--     password. Nothing in this migration stores or generates a password; the
--     app never sees a service key. The `invite` Edge Function does, and its
--     authority comes from SQL (assert_can_invite / record_invitation), not from
--     a hand-written role check.
--
-- STATUS: authored, NOT APPLIED.
--
-- Operator steps in order — §9 refuses to commit unless they are done:
--
--   1. Both owners need accounts BEFORE sign-up is disabled. Create the missing
--      one now (public sign-up still works):
--         select email from auth.users
--          where lower(email) in ('wellnesswithwritingale@gmail.com',
--                                 'michaelnnamdi62@gmail.com');
--   2. Apply this file: `supabase db push --remote`.
--   3. Bootstrap owners and break-glass (granted_by null is allowed only here):
--         select set_config('app.identity_privileged','on',true);
--         insert into public.platform_owners (user_id, granted_by)
--         values ('<OWNER_1_UUID>', null), ('<OWNER_2_UUID>', null);
--         select public.set_break_glass_admin('<BREAK_GLASS_UUID>');
--   4. Disable public sign-up in GoTrue (Dashboard -> Authentication -> Providers).
--      This file removes the database's ability to grant tenancy at creation;
--      only this setting closes the door itself.
--   5. Deploy the `invite` Edge Function with the service key as a SECRET, then
--      invite each owner a role instance so they can use the app, and enrol TOTP
--      for both (owner removal requires has_recent_mfa()).
--   6. List who is now silent:
--         select p.email from public.profiles p
--          where p.verified and p.disabled_at is null
--            and not exists (select 1 from public.org_memberships m
--                            where m.user_id = p.id and m.status = 'active');
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Platform registry: settings row + the set of owners
-- ---------------------------------------------------------------------------
create table if not exists public.platform (
  id                   smallint primary key default 1 check (id = 1),
  break_glass_user_id  uuid references auth.users (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_by           uuid references auth.users (id) on delete set null
);
insert into public.platform (id) values (1) on conflict (id) do nothing;

create table if not exists public.platform_owners (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default now()
);
create index if not exists platform_owners_granted_by_idx
  on public.platform_owners (granted_by);

alter table public.platform        enable row level security;
alter table public.platform_owners enable row level security;
revoke all on table public.platform, public.platform_owners from anon, authenticated;
grant select on table public.platform, public.platform_owners to authenticated;

-- Who is accountable for the platform is visible to members. Nobody writes these
-- tables from a client role: grants go through §4.
drop policy if exists platform_member_read on public.platform;
create policy platform_member_read on public.platform
  for select using (public.is_active_member());
drop policy if exists platform_owners_read on public.platform_owners;
create policy platform_owners_read on public.platform_owners
  for select using (public.is_active_member());

-- ---------------------------------------------------------------------------
-- 2. Owner helpers — verified-and-not-revoked like every gate since 0008, so a
--    revoked owner stops owning on the next query without touching tokens.
-- ---------------------------------------------------------------------------
create or replace function public.is_platform_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.platform_owners po
    join public.profiles p on p.id = po.user_id
    where po.user_id = auth.uid() and p.verified and p.disabled_at is null
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

-- Break-glass may manage members and clinical roles; ownership authority is not
-- part of it.
create or replace function public.platform_can_manage()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_owner() or public.is_break_glass_admin();
$$;

-- ---------------------------------------------------------------------------
-- 3. Integrity guards: immutable owner rows, no ownerless platform, and the
--    break-glass identity can never also be an owner.
-- ---------------------------------------------------------------------------
create or replace function public.guard_platform_owners()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'PLATFORM_OWNERS_ARE_IMMUTABLE' using errcode = '42501';
  end if;

  -- Bootstrap path (§8 step 3) inserts owners with granted_by null.
  if coalesce(current_setting('app.identity_privileged', true), 'off') = 'on' then
    return null;
  end if;

  if tg_op = 'INSERT' then
    if new.granted_by is not null and not exists (
        select 1 from public.profiles
         where id = new.granted_by and verified and disabled_at is null) then
      raise exception 'GRANTER_NOT_ACTIVE' using errcode = '42501';
    end if;
    if exists (select 1 from public.platform
                where id = 1 and break_glass_user_id = new.user_id) then
      raise exception 'BREAK_GLASS_CANNOT_BE_OWNER' using errcode = 'P0001';
    end if;
    return null;
  end if;

  -- DELETE. Fires on the auth.users ON DELETE CASCADE too, which is intended: an
  -- owner cannot be deleted out from under a one-owner platform.
  if (select count(*) from public.platform_owners) <= 1 then
    raise exception 'CANNOT_REMOVE_LAST_OWNER' using errcode = 'P0001';
  end if;
  return null;
end;
$$;

drop trigger if exists platform_owners_guard on public.platform_owners;
create trigger platform_owners_guard
  after insert or delete on public.platform_owners
  for each row execute function public.guard_platform_owners();

drop trigger if exists platform_owners_no_update on public.platform_owners;
create trigger platform_owners_no_update
  before update on public.platform_owners
  for each row execute function public.guard_platform_owners();

-- ---------------------------------------------------------------------------
-- 4. Owner-set RPCs
-- ---------------------------------------------------------------------------
create or replace function public.grant_platform_owner(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_owner() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles
                  where id = p_user and verified and disabled_at is null) then
    raise exception 'TARGET_NOT_ACTIVE' using errcode = 'P0001';
  end if;

  insert into public.platform_owners (user_id, granted_by)
  values (p_user, auth.uid())
  on conflict (user_id) do nothing;

  insert into public.auth_events (org_id, user_id, event, session_id, detail)
  values (public.current_org_id(), p_user, 'platform_owner_changed',
          auth.jwt()->>'session_id',
          jsonb_build_object('action', 'granted', 'by', auth.uid()));
  perform public.append_audit('insert', 'platform_owners', p_user::text,
          jsonb_build_object('granted_by', auth.uid())::text);
end;
$$;

create or replace function public.revoke_platform_owner(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_owner() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if not public.has_recent_mfa() then
    raise exception 'STEP_UP_REQUIRED' using errcode = '42501';
  end if;

  delete from public.platform_owners where user_id = p_user;  -- last-owner guard
  if not found then raise exception 'NOT_AN_OWNER' using errcode = 'P0001'; end if;

  insert into public.auth_events (org_id, user_id, event, session_id, detail)
  values (public.current_org_id(), p_user, 'platform_owner_changed',
          auth.jwt()->>'session_id',
          jsonb_build_object('action', 'revoked', 'by', auth.uid()));
  perform public.append_audit('delete', 'platform_owners', p_user::text,
          jsonb_build_object('revoked_by', auth.uid())::text);
end;
$$;

create or replace function public.set_break_glass_admin(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_owner() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_user is not null and exists (select 1 from public.platform_owners
                                     where user_id = p_user) then
    raise exception 'BREAK_GLASS_CANNOT_BE_OWNER' using errcode = 'P0001';
  end if;
  if p_user is not null and not exists (select 1 from public.profiles
                                         where id = p_user and verified) then
    raise exception 'TARGET_NOT_FOUND' using errcode = 'P0001';
  end if;

  update public.platform set break_glass_user_id = p_user, updated_by = auth.uid()
   where id = 1;
  perform public.append_audit('update', 'platform', '1',
          jsonb_build_object('break_glass_user_id', p_user)::text);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Stop granting tenancy at account creation
-- ---------------------------------------------------------------------------
-- 0001:15 declared org_id not null, which is what forced handle_new_user to attach
-- every new account to the first clinic.
alter table public.profiles alter column org_id drop not null;
alter table public.profiles alter column role set default 'reception';

-- Fires for invite-created accounts too: a base identity, no org, no honoured
-- metadata role, not verified. current_org_id() is NULL until claim_invitation()
-- or an owner's assign_role() creates a membership.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
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

-- Single-organisation platform: no self-service org mint, and no owner-facing one
-- either until multi-tenancy is actually a requirement.
drop function if exists public.create_organization(text, text);

-- ---------------------------------------------------------------------------
-- 6. Owner-only authority over the admin role
-- ---------------------------------------------------------------------------
-- The gate is platform_can_manage(), not is_admin(): break-glass must be able to
-- reassign clinical roles in an emergency without holding the Admin-1 instance.
create or replace function public.assign_role(p_user uuid, p_role_instance uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_org  uuid := public.current_org_id();
  v_inst public.org_role_instances%rowtype;
  v_mem  uuid;
  v_id   uuid;
begin
  if v_org is null then raise exception 'NOT_A_MEMBER' using errcode = '42501'; end if;
  if not public.platform_can_manage() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

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

-- 0010 gated slot creation on is_admin(); break-glass manages members without
-- holding the Admin-1 instance, so it could not staff a second nurse. Same gate as
-- assign_role, and an admin slot stays an owner decision — otherwise "create an
-- Admin-3 instance" would be a side door around ADMIN_GRANT_OWNER_ONLY.
create or replace function public.create_role_instance(p_role_key text, p_label text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_org  uuid := public.current_org_id();
  v_slot int;
  v_id   uuid;
begin
  if v_org is null then raise exception 'NOT_A_MEMBER' using errcode = '42501'; end if;
  if not public.platform_can_manage() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_role_key = 'admin' and not public.is_platform_owner() then
    raise exception 'ADMIN_GRANT_OWNER_ONLY' using errcode = '42501';
  end if;
  if not public.is_valid_role(p_role_key) then
    raise exception 'INVALID_ROLE' using errcode = 'P0001';
  end if;

  select coalesce(max(slot_no), 0) + 1 into v_slot
    from public.org_role_instances where org_id = v_org and role_key = p_role_key;
  if v_slot > 25 then raise exception 'ROLE_SLOT_LIMIT' using errcode = 'P0001'; end if;

  insert into public.org_role_instances (org_id, role_key, slot_no, label, created_by)
  values (v_org, p_role_key, v_slot,
          coalesce(nullif(btrim(p_label), ''), initcap(p_role_key) || '-' || v_slot),
          auth.uid())
  returning id into v_id;

  perform public.append_audit('insert', 'org_role_instances', v_id::text,
          jsonb_build_object('role_key', p_role_key, 'slot_no', v_slot)::text);
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Invite issue/claim under the invite-link model
--
-- The SPA holds no service key and never sees a password. The `invite` Edge
-- Function: (a) calls assert_can_invite() with the OWNER's JWT, (b) asks GoTrue
-- for an invite link with the service key, (c) calls record_invitation() with the
-- service key, storing only the SHA-256 of that link's token. The invitee opens
-- the link and sets their own password; the click proves the mailbox. On their
-- next sign-in the app calls claim_invitation(), which attaches membership and
-- role from the pending row — no bearer token crosses through our app.
-- ---------------------------------------------------------------------------
alter table public.invitations
  add column if not exists user_id    uuid references auth.users (id) on delete set null,
  add column if not exists full_name  text,
  add column if not exists delivery   text not null default 'auto_email'
    check (delivery in ('auto_email','manual_link')),
  add column if not exists sent_at    timestamptz,
  add column if not exists claimed_at timestamptz;

-- GoTrue owns the token now, so ours is a hash of it and may be blank until the
-- function has generated the link.
alter table public.invitations alter column token_hash drop not null;
drop index if exists public.invitations_live_email_idx;
create unique index invitations_live_email_idx
  on public.invitations (org_id, email_key) where status = 'sent';

-- Caller authorization lives in SQL, in the same place as every other identity
-- decision. Also the single place that refuses an admin invite: no invitation can
-- hand out the admin role, so an owner must assign that slot deliberately.
create or replace function public.assert_can_invite(p_role_key text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_org uuid := public.current_org_id();
begin
  if v_org is null then raise exception 'NOT_A_MEMBER' using errcode = '42501'; end if;
  if not public.is_platform_owner() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_role_key = 'admin' then
    raise exception 'ADMIN_GRANT_OWNER_ONLY' using errcode = '42501';
  end if;
  return jsonb_build_object('org_id', v_org, 'actor_id', auth.uid());
end;
$$;

-- Service-role only, and it re-validates the claimed inviter instead of trusting
-- the function's word: the actor must still be an owner and an active member of the
-- org it names.
create or replace function public.record_invitation(
  p_email text, p_full_name text, p_role_key text, p_role_instance uuid,
  p_token_hash text, p_delivery text, p_org uuid, p_actor uuid
)
returns uuid language plpgsql security definer
set search_path = public, extensions as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_id    uuid;
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'SERVICE_ROLE_ONLY' using errcode = '42501';
  end if;
  if not exists (select 1 from public.platform_owners po
                  join public.profiles p on p.id = po.user_id
                 where po.user_id = p_actor and p.verified and p.disabled_at is null) then
    raise exception 'INVITER_NOT_AN_OWNER' using errcode = '42501';
  end if;
  if not exists (select 1 from public.org_memberships
                  where org_id = p_org and user_id = p_actor and status = 'active') then
    raise exception 'INVITER_NOT_A_MEMBER' using errcode = '42501';
  end if;
  if p_role_key = 'admin' then
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
     where id = p_role_instance and org_id = p_org
       and status = 'active' and role_key = p_role_key) then
    raise exception 'SLOT_NOT_FOUND' using errcode = 'P0001';
  end if;

  update public.invitations
     set status = 'revoked', revoked_at = now()
   where org_id = p_org and email_key = v_email and status = 'sent';

  insert into public.invitations
    (org_id, email, role_key, role_instance_id, token_hash, created_by,
     status, user_id, full_name, delivery, sent_at)
  values (p_org, v_email, p_role_key, p_role_instance, p_token_hash, p_actor,
          'sent', null, nullif(btrim(coalesce(p_full_name, '')), ''),
          coalesce(p_delivery, 'auto_email'), now())
  returning id into v_id;

  perform public.append_audit('invite', 'invitation', v_id::text,
          jsonb_build_object('email', v_email, 'role_key', p_role_key,
                             'delivery', coalesce(p_delivery, 'auto_email'))::text);
  return v_id;
end;
$$;

-- Invitee side. No token: GoTrue already proved the address, so this matches the
-- signed-in email to a live invitation and grants exactly what an owner proposed.
create or replace function public.claim_invitation()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt()->>'email', ''));
  v_inv   public.invitations%rowtype;
  v_mem   uuid;
  v_inst  uuid;
begin
  if v_uid is null or v_email = '' then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_inv from public.invitations
   where email_key = v_email and status = 'sent'
   order by created_at desc
   for update;
  if not found then raise exception 'NO_PENDING_INVITATION' using errcode = 'P0001'; end if;

  if v_inv.expires_at <= now() then
    update public.invitations set status = 'expired' where id = v_inv.id;
    raise exception 'INVITATION_EXPIRED' using errcode = 'P0001';
  end if;

  select i.id into v_inst from public.org_role_instances i
   where i.id = v_inv.role_instance_id and i.status = 'active';
  if v_inst is null then
    select i.id into v_inst from public.org_role_instances i
     where i.org_id = v_inv.org_id and i.role_key = v_inv.role_key and i.status = 'active'
       and not exists (select 1 from public.role_assignments ra
                        where ra.role_instance_id = i.id and ra.revoked_at is null)
     order by i.slot_no limit 1;
  end if;
  if v_inst is null then raise exception 'NO_FREE_ROLE_SLOT' using errcode = 'P0001'; end if;

  insert into public.org_memberships (org_id, user_id, status, created_by)
  values (v_inv.org_id, v_uid, 'active', v_inv.created_by)
  on conflict (org_id, user_id) do update set status = 'active'
  returning id into v_mem;

  insert into public.role_assignments (org_id, membership_id, role_instance_id, assigned_by)
  values (v_inv.org_id, v_mem, v_inst, v_inv.created_by);

  update public.invitations
     set status = 'accepted', accepted_at = now(), accepted_by = v_uid,
         claimed_at = now(), user_id = v_uid
   where id = v_inv.id;

  perform set_config('app.identity_privileged', 'on', true);
  update public.profiles
     set verified = true, disabled_at = null,
         active_org_id = coalesce(active_org_id, v_inv.org_id)
   where id = v_uid;
  perform set_config('app.identity_privileged', 'off', true);
  perform public.sync_legacy_profile(v_uid);

  insert into public.auth_events (org_id, user_id, event, session_id, detail)
  values (v_inv.org_id, v_uid, 'invite_accepted', auth.jwt()->>'session_id',
          jsonb_build_object('invitation_id', v_inv.id, 'role_key', v_inv.role_key));
  perform public.append_audit('approve', 'profile', v_uid::text,
          jsonb_build_object('via', 'invitation', 'invitation_id', v_inv.id,
                             'role_key', v_inv.role_key)::text);

  return jsonb_build_object('org_id', v_inv.org_id, 'role_key', v_inv.role_key);
end;
$$;

-- The 0010 app-facing invite minted its own bearer token and returned a raw secret
-- to the SPA. The invite-link model needs neither, so it goes.
drop function if exists public.invite_member(text, text, uuid);

alter table public.auth_events drop constraint if exists auth_events_event_check;
alter table public.auth_events add constraint auth_events_event_check check (event in (
  'sign_in','mfa_ok','step_up','sign_out','lockout','access_changed','invite_accepted',
  'profile_approved','profile_updated','org_created','org_archived','ownership_transferred',
  'invite_declined','invite_revoked','role_assigned','role_revoked','membership_suspended',
  'join_requested','platform_owner_changed'));

-- ---------------------------------------------------------------------------
-- 8. Break-glass recovery (written, not folklore)
-- ---------------------------------------------------------------------------
-- admin@www.clinic has had its password replaced by an in-database random hash
-- since 2026-11-03, so nobody holds it:
--   1. Dashboard -> Authentication -> Users -> admin@www.clinic -> set new password.
--   2. Sign in, enrol TOTP, assign the roles that need assigning.
--   3. Hand control back: revoke_platform_owner(...) / set_break_glass_admin(null).
-- Storing a credential for it turns break-glass back into the shared-credential
-- finding (R-14).

-- ---------------------------------------------------------------------------
-- 9. Assertions — refuse to commit half-locked-down
-- ---------------------------------------------------------------------------
do $$
declare
  v_owners     int;
  v_bad_owner  int;
  v_unassigned int;
begin
  select count(*) into v_owners from public.platform_owners;
  if v_owners < 1 then
    raise exception
      'PLATFORM_OWNERS_BOOTSTRAP_REQUIRED: no owners recorded. Run header step 3, '
      'then re-apply this migration.'
      using errcode = 'P0001';
  end if;

  select count(*) into v_bad_owner
    from public.platform_owners po
    left join public.profiles p on p.id = po.user_id
    where p.id is null or not p.verified or p.disabled_at is not null
       or po.user_id = (select break_glass_user_id from public.platform where id = 1);
  if v_bad_owner > 0 then
    raise exception 'PLATFORM_OWNER_NOT_ACTIVE_OR_CONFLICTED' using errcode = 'P0001';
  end if;

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

-- Expected after apply + bootstrap on zdtaludwhxnjutosrnvi:
--   platform_owners: 2 rows. profiles.org_id nullable; handle_new_user() creates a
--   base account with no org and no membership; create_organization() -> 42883.
--   assert_can_invite('admin') as any caller -> ADMIN_GRANT_OWNER_ONLY.
--   record_invitation(...) with a user JWT -> SERVICE_ROLE_ONLY; with a non-owner
--   actor -> INVITER_NOT_AN_OWNER.
--   claim_invitation() with no pending row -> NO_PENDING_INVITATION; with one ->
--   membership + role, profiles.verified flips true.
--   Break-glass: assign_role(clinical slot) ok, assign_role(Admin-1) ->
--   ADMIN_GRANT_OWNER_ONLY. revoke_platform_owner() at aal1 -> STEP_UP_REQUIRED;
--   removing the last owner -> CANNOT_REMOVE_LAST_OWNER.
