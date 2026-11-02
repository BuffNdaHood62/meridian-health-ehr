-- ============================================================================
-- 0010_org_memberships_roles.sql — multi-organisation accounts + role instances
--
-- Implements docs/adr/0004-multi-org-role-model.md.
--
-- Before this migration: one profiles row = one account in exactly one org with
-- exactly one role (`profiles.org_id`, `profiles.role`), read by
-- current_org_id(), is_admin(), role_allows().
--
-- After it:
--   * profiles = base account (identity). active_org_id = the org this account
--     is acting in.
--   * org_memberships = account <-> org, many-to-many.
--   * org_role_instances = the org's slots ("Doctor-1", "Doctor-2").
--   * role_assignments = who fills which slot; permissions are the UNION of the
--     role keys of the caller's live assignments in the ACTIVE org.
--   * role_permissions = the authorisation matrix, seeded verbatim from the
--     role_allows() CASE in 0008 (including its wildcard behaviour).
--   * invitations gain a real lifecycle: sent/accepted/declined/expired/revoked.
--
-- The 0007 RLS policy bodies are NOT touched. Every one of them resolves
-- tenancy and authorisation through the helpers rewritten in §5, so swapping
-- those helpers changes the whole surface at once.
--
-- Compat: profiles.org_id / profiles.role are kept for one release as a cache
-- written by sync_legacy_profile(). No RLS reads them after this migration.
--
-- STATUS: authored, NOT APPLIED. Run on staging first; §9 asserts the backfill.
-- pgcrypto lives in the `extensions` schema on hosted projects, so every
-- function that hashes or generates bytes pins `search_path = public, extensions`
-- (R-20, fixed for 0007/0008 by 0009).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Organisation: owner, shareable code, lifecycle
-- ---------------------------------------------------------------------------
alter table public.organizations
  add column if not exists org_code      text,
  add column if not exists owner_user_id uuid references auth.users (id) on delete restrict,
  add column if not exists status        text not null default 'active'
    check (status in ('active','suspended','archived')),
  add column if not exists archived_at   timestamptz;

create unique index if not exists organizations_org_code_key
  on public.organizations (upper(org_code));
create unique index if not exists organizations_slug_lower_key
  on public.organizations (lower(slug));

alter table public.profiles
  add column if not exists active_org_id uuid references public.organizations (id) on delete set null;

-- ---------------------------------------------------------------------------
-- 2. Memberships, role instances, assignments
-- ---------------------------------------------------------------------------
create table if not exists public.org_memberships (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  status     text not null default 'active'
             check (status in ('active','suspended','removed')),
  joined_at  timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  unique (org_id, user_id),
  unique (org_id, id)                         -- composite-FK target
);
create index if not exists org_memberships_user_idx on public.org_memberships (user_id);

create table if not exists public.org_role_instances (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  role_key   text not null check (role_key in ('doctor','nurse','reception','admin','lab')),
  slot_no    int  not null check (slot_no between 1 and 99),
  label      text not null check (length(btrim(label)) between 1 and 40),
  status     text not null default 'active' check (status in ('active','retired')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (org_id, role_key, slot_no),
  unique (org_id, id)                         -- composite-FK target
);
create unique index if not exists org_role_instances_label_key
  on public.org_role_instances (org_id, lower(label));

create table if not exists public.role_assignments (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations (id) on delete cascade,
  membership_id    uuid not null,
  role_instance_id uuid not null,
  assigned_by      uuid references auth.users (id) on delete set null,
  assigned_at      timestamptz not null default now(),
  revoked_at       timestamptz,
  revoked_by       uuid references auth.users (id) on delete set null,
  foreign key (org_id, membership_id)
    references public.org_memberships (org_id, id) on delete cascade,
  foreign key (org_id, role_instance_id)
    references public.org_role_instances (org_id, id) on delete restrict
);
create unique index if not exists role_assignments_live_idx
  on public.role_assignments (membership_id, role_instance_id) where revoked_at is null;
create index if not exists role_assignments_instance_idx
  on public.role_assignments (role_instance_id) where revoked_at is null;

-- ---------------------------------------------------------------------------
-- 3. Permission matrix — seeded verbatim from 0008's role_allows() CASE.
--    entity '*' means "any entity", matching the wildcard branches there.
-- ---------------------------------------------------------------------------
create table if not exists public.role_permissions (
  role_key text not null check (role_key in ('doctor','nurse','reception','admin','lab')),
  entity   text not null,
  action   text not null check (action in ('select','insert','update')),
  primary key (role_key, entity, action)
);

insert into public.role_permissions (role_key, entity, action) values
  -- doctor: any entity, select/insert/update
  ('doctor','*','select'), ('doctor','*','insert'), ('doctor','*','update'),
  -- nurse: read anything; write only these; update orders
  ('nurse','*','select'),
  ('nurse','order_administrations','insert'), ('nurse','vitals','insert'),
  ('nurse','notes','insert'), ('nurse','messages','insert'), ('nurse','alerts','insert'),
  ('nurse','orders','update'),
  -- lab: read anything; write labs + messages; update labs
  ('lab','*','select'),
  ('lab','labs','insert'), ('lab','messages','insert'), ('lab','labs','update'),
  -- reception: read anything; register patients; no clinical writes
  ('reception','*','select'),
  ('reception','www_clients','insert'), ('reception','www_client_visits','insert'),
  ('reception','www_client_demographics','insert'), ('reception','appointments','insert'),
  ('reception','messages','insert'), ('reception','shares','insert'),
  ('reception','www_client_demographics','update'), ('reception','appointments','update'),
  ('reception','patients','update'),
  -- admin: read anything; manage identity + counters
  ('admin','*','select'),
  ('admin','profiles','insert'), ('admin','profiles','update'),
  ('admin','organizations','insert'), ('admin','organizations','update'),
  ('admin','www_number_counters','insert'), ('admin','www_number_counters','update')
on conflict do nothing;

-- NOTE (R-21): this reproduces current behaviour, which lets `lab` and
-- `reception` SELECT every entity — including notes — because the 0008 CASE
-- grants select unconditionally. See ADR-0004; tightening is a clinical
-- decision, done by editing this table, not the helper.

-- ---------------------------------------------------------------------------
-- 4. Invitations: lifecycle + role instance
-- ---------------------------------------------------------------------------
alter table public.invitations
  add column if not exists role_key         text,
  add column if not exists role_instance_id uuid references public.org_role_instances (id) on delete set null,
  add column if not exists status           text,
  add column if not exists declined_at      timestamptz;

update public.invitations
   set role_key = role,
       status = case
         when accepted_at is not null then 'accepted'
         when revoked_at  is not null then 'revoked'
         when expires_at  <= now()    then 'expired'
         else 'sent'
       end
 where role_key is null or status is null;

alter table public.invitations alter column role_key set not null;
alter table public.invitations alter column status  set not null;
alter table public.invitations alter column status  set default 'sent';

alter table public.invitations drop constraint if exists invitations_status_check;
alter table public.invitations add constraint invitations_status_check
  check (status in ('sent','accepted','declined','expired','revoked'));
alter table public.invitations drop constraint if exists invitations_terminal_times;
alter table public.invitations add constraint invitations_terminal_times check (
  (status <> 'accepted' or accepted_at is not null) and
  (status <> 'declined' or declined_at is not null) and
  (status <> 'revoked'  or revoked_at  is not null));

drop index if exists public.invitations_live_email_idx;
create unique index invitations_live_email_idx
  on public.invitations (org_id, email_key) where status = 'sent';

drop trigger if exists invitations_status_guard on public.invitations;
create or replace function public.guard_invitation_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status <> 'sent' and new.status is distinct from old.status then
    raise exception 'INVITATION_ALREADY_RESOLVED' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger invitations_status_guard
  before update on public.invitations
  for each row execute function public.guard_invitation_status();

-- The old column and its check are replaced by role_key above.
alter table public.invitations drop constraint if exists invitations_role_check;
alter table public.invitations drop column if exists role;

-- New identity transitions need to be recordable in the trail.
alter table public.auth_events drop constraint if exists auth_events_event_check;
alter table public.auth_events add constraint auth_events_event_check check (event in (
  'sign_in','mfa_ok','step_up','sign_out','lockout','access_changed','invite_accepted',
  'profile_approved','profile_updated','org_created','org_archived','ownership_transferred',
  'invite_declined','invite_revoked','role_assigned','role_revoked',
  'membership_suspended','join_requested'));

-- The 2-arg invite RPC is superseded by invite_member(); leaving it behind would
-- leave a function whose body reads a column that no longer exists.
drop function if exists public.create_invitation(text, text);

-- ---------------------------------------------------------------------------
-- 5. Identity helpers — same names, new resolution
-- ---------------------------------------------------------------------------
create or replace function public.is_active_member()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.profiles p
    join public.org_memberships m on m.user_id = p.id and m.status = 'active'
    join public.organizations o   on o.id = m.org_id and o.status = 'active'
    where p.id = auth.uid() and p.verified and p.disabled_at is null
  );
$$;

create or replace function public.is_org_owner(p_org uuid default null)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organizations o
    where o.id = coalesce(p_org, public.current_org_id())
      and o.owner_user_id = auth.uid()
      and o.status = 'active'
  );
$$;

-- Active org = a stored preference that is re-validated against membership on
-- every call, so revocation/archival takes effect on the next query.
create or replace function public.current_org_id()
returns uuid language sql stable security definer set search_path = public as $$
  select m.org_id
  from public.profiles p
  join public.org_memberships m on m.user_id = p.id and m.org_id = p.active_org_id
  join public.organizations o   on o.id = m.org_id and o.status = 'active'
  where p.id = auth.uid()
    and p.verified and p.disabled_at is null
    and m.status = 'active';
$$;

create or replace function public.current_role_keys()
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct k), '{}'::text[])
  from (
    select ri.role_key as k
      from public.role_assignments ra
      join public.org_role_instances ri on ri.id = ra.role_instance_id and ri.status = 'active'
      join public.org_memberships m     on m.id = ra.membership_id and m.status = 'active'
     where ra.org_id = public.current_org_id()
       and m.user_id = auth.uid()
       and ra.revoked_at is null
    union
    select 'admin'
     where public.is_org_owner(public.current_org_id())
  ) role_set;
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select 'admin' = any (public.current_role_keys());
$$;

create or replace function public.role_allows(p_entity text, p_action text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.role_permissions rp
    where rp.role_key = any (public.current_role_keys())
      and rp.action = p_action
      and rp.entity in (p_entity, '*')
  );
$$;

-- 0004's helper is used by nothing after 0007. Keep it aligned so a future
-- policy cannot reintroduce the unverified hole through it.
create or replace function public.role_can(p_entity text, p_action text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.role_allows(p_entity, p_action);
$$;

-- Legacy cache for profiles.org_id / profiles.role. Only callers that legitimately
-- change membership call this; no RLS reads those columns any more.
create or replace function public.sync_legacy_profile(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_org  uuid;
  v_role text;
begin
  select active_org_id into v_org from public.profiles where id = p_user;
  select ri.role_key into v_role
    from public.role_assignments ra
    join public.org_role_instances ri on ri.id = ra.role_instance_id
    join public.org_memberships m     on m.id = ra.membership_id
   where m.user_id = p_user and m.org_id = v_org and ra.revoked_at is null
   order by ri.slot_no
   limit 1;

  perform set_config('app.identity_privileged', 'on', true);
  update public.profiles
     set org_id = v_org,
         role   = coalesce(v_role, role)
   where id = p_user;
  perform set_config('app.identity_privileged', 'off', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Backfill from the single-org/single-role model
-- ---------------------------------------------------------------------------
insert into public.org_memberships (org_id, user_id, status, joined_at)
select p.org_id, p.id, 'active', coalesce(p.created_at, now())
  from public.profiles p
 where p.org_id is not null
on conflict (org_id, user_id) do nothing;

with ranked as (
  select p.id, p.org_id, p.role,
         row_number() over (partition by p.org_id, p.role
                            order by p.created_at nulls last, p.id) as rn
    from public.profiles p
   where p.org_id is not null
)
insert into public.org_role_instances (org_id, role_key, slot_no, label)
select org_id, role, rn, initcap(role) || '-' || rn
  from ranked
on conflict (org_id, role_key, slot_no) do nothing;

with ranked as (
  select p.id, p.org_id, p.role,
         row_number() over (partition by p.org_id, p.role
                            order by p.created_at nulls last, p.id) as rn
    from public.profiles p
   where p.org_id is not null
)
insert into public.role_assignments (org_id, membership_id, role_instance_id)
select r.org_id, m.id, i.id
  from ranked r
  join public.org_memberships    m on m.org_id = r.org_id and m.user_id = r.id
  join public.org_role_instances i on i.org_id = r.org_id
                                  and i.role_key = r.role and i.slot_no = r.rn
on conflict do nothing;

update public.profiles
   set active_org_id = org_id
 where active_org_id is null and org_id is not null;

update public.organizations o
   set owner_user_id = coalesce(
     (select p.id from public.profiles p
       where p.org_id = o.id and p.role = 'admin'
       order by p.created_at nulls last, p.id limit 1),
     (select p.id from public.profiles p
       where p.org_id = o.id
       order by p.created_at nulls last, p.id limit 1))
 where o.owner_user_id is null;

update public.organizations
   set org_code = 'ORG-' || upper(substr(replace(id::text, '-', ''), 1, 6))
 where org_code is null;
alter table public.organizations alter column org_code set not null;

-- ---------------------------------------------------------------------------
-- 7. RPCs — every mutation is server-side and audited
-- ---------------------------------------------------------------------------

create or replace function public.create_organization(p_name text, p_slug text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_org   uuid;
  v_slug  text;
  v_code  text;
  v_inst  uuid;
  v_try   int := 0;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles
                  where id = v_uid and verified and disabled_at is null) then
    raise exception 'ACCOUNT_NOT_VERIFIED' using errcode = '42501';
  end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'INVALID_NAME' using errcode = 'P0001';
  end if;

  v_slug := coalesce(nullif(btrim(p_slug), ''),
                     regexp_replace(lower(btrim(p_name)), '[^a-z0-9]+', '-', 'g')
                     || '-' || substr(v_uid::text, 1, 4));
  if exists (select 1 from public.organizations o where lower(o.slug) = lower(v_slug)) then
    raise exception 'ORG_SLUG_TAKEN' using errcode = 'P0001';
  end if;

  loop
    v_try := v_try + 1;
    v_code := 'ORG-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    begin
      insert into public.organizations (name, slug, org_code, owner_user_id)
      values (btrim(p_name), lower(v_slug), v_code, v_uid)
      returning id into v_org;
      exit;
    exception when unique_violation then
      if v_try >= 5 then raise exception 'ORG_CODE_COLLISION' using errcode = 'P0001'; end if;
    end;
  end loop;

  insert into public.org_role_instances (org_id, role_key, slot_no, label, created_by)
  values (v_org, 'admin', 1, 'Admin-1', v_uid)
  returning id into v_inst;

  insert into public.org_memberships (org_id, user_id, status, created_by)
  values (v_org, v_uid, 'active', v_uid)
  on conflict (org_id, user_id) do update set status = 'active';

  insert into public.role_assignments (org_id, membership_id, role_instance_id, assigned_by)
  select v_org, m.id, v_inst, v_uid
    from public.org_memberships m
   where m.org_id = v_org and m.user_id = v_uid;

  update public.profiles set active_org_id = v_org where id = v_uid;
  perform public.sync_legacy_profile(v_uid);

  insert into public.auth_events (org_id, user_id, event, session_id, detail)
  values (v_org, v_uid, 'org_created', auth.jwt()->>'session_id',
          jsonb_build_object('slug', v_slug, 'org_code', v_code));
  perform public.append_audit('insert', 'organizations', v_org::text,
          jsonb_build_object('slug', v_slug, 'org_code', v_code)::text);

  return jsonb_build_object('org_id', v_org, 'slug', v_slug, 'org_code', v_code);
end;
$$;

create or replace function public.switch_active_org(p_org uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.org_memberships m
      join public.organizations o on o.id = m.org_id
     where m.user_id = v_uid and m.org_id = p_org
       and m.status = 'active' and o.status = 'active'
  ) then
    raise exception 'NOT_A_MEMBER' using errcode = '42501';
  end if;

  update public.profiles set active_org_id = p_org where id = v_uid;
  perform public.sync_legacy_profile(v_uid);
  perform public.append_audit('update', 'profiles', v_uid::text,
          jsonb_build_object('active_org_id', p_org)::text);
end;
$$;

create or replace function public.create_role_instance(p_role_key text, p_label text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_org  uuid := public.current_org_id();
  v_slot int;
  v_id   uuid;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if not public.is_valid_role(p_role_key) then
    raise exception 'INVALID_ROLE' using errcode = 'P0001';
  end if;

  select coalesce(max(slot_no), 0) + 1 into v_slot
    from public.org_role_instances where org_id = v_org and role_key = p_role_key;
  if v_slot > 99 then raise exception 'ROLE_SLOT_LIMIT' using errcode = 'P0001'; end if;
  if v_slot > 25 then
    raise exception 'ROLE_SLOT_LIMIT' using errcode = 'P0001';
  end if;

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

create or replace function public.retire_role_instance(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.current_org_id();
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if exists (select 1 from public.role_assignments
              where role_instance_id = p_id and revoked_at is null) then
    raise exception 'SLOT_IN_USE' using errcode = 'P0001';
  end if;
  update public.org_role_instances set status = 'retired'
   where id = p_id and org_id = v_org;
  if not found then raise exception 'SLOT_NOT_FOUND' using errcode = 'P0001'; end if;
  perform public.append_audit('update', 'org_role_instances', p_id::text,
          jsonb_build_object('status', 'retired')::text);
end;
$$;

create or replace function public.assign_role(p_user uuid, p_role_instance uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_org  uuid := public.current_org_id();
  v_inst public.org_role_instances%rowtype;
  v_mem  uuid;
  v_id   uuid;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0001';
  end if;

  select * into v_inst from public.org_role_instances
   where id = p_role_instance and org_id = v_org and status = 'active';
  if not found then raise exception 'SLOT_NOT_FOUND' using errcode = 'P0001'; end if;

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

-- Kept so the documented bootstrap path still works, but it now grants real
-- access: verification alone is not enough under the membership model.
create or replace function public.approve_profile(p_user_id uuid, p_role text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_org  uuid := public.current_org_id();
  v_role text;
  v_inst uuid;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id_id) then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_role := coalesce(p_role,
                     (select requested_role from public.profiles where id = p_user_id_id),
                     'reception');
  if not public.is_valid_role(v_role) then
    raise exception 'INVALID_ROLE' using errcode = 'P0001';
  end if;

  perform set_config('app.identity_privileged', 'on', true);
  update public.profiles set verified = true, disabled_at = null where id = p_user_id;
  perform set_config('app.identity_privileged', 'off', true);

  select i.id into v_inst
    from public.org_role_instances i
   where i.org_id = v_org and i.role_key = v_role and i.status = 'active'
     and not exists (select 1 from public.role_assignments ra
                      where ra.role_instance_id = i.id and ra.revoked_at is null)
   order by i.slot_no limit 1;
  if v_inst is null then
    v_inst := public.create_role_instance(v_role, null);
  end if;

  begin
    perform public.assign_role(p_user_id, v_inst);
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'ALREADY_ASSIGNED' then raise; end if;
  end;

  perform public.append_audit('approve', 'profile', p_user::text,
          jsonb_build_object('role_key', v_role, 'slot', v_inst)::text);
end;
$$;

-- Account-level only. It does NOT grant org access under the membership model;
-- use approve_profile() or an invitation for that.
create or replace function public.verify_profile(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  perform set_config('app.identity_privileged', 'on', true);
  update public.profiles set verified = true where id = p_user_id;
  perform set_config('app.identity_privileged', 'off', true);
end;
$$;

create or replace function public.revoke_role(p_assignment uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.current_org_id();
  v_uid uuid;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  update public.role_assignments
     set revoked_at = now(), revoked_by = auth.uid()
   where id = p_assignment and org_id = v_org and revoked_at is null
   returning membership_id into v_uid;
  if not found then raise exception 'ASSIGNMENT_NOT_FOUND' using errcode = 'P0001'; end if;

  select user_id into v_uid from public.org_memberships where id = v_uid;
  perform public.sync_legacy_profile(v_uid);
  insert into public.auth_events (org_id, user_id, event, session_id, detail)
  values (v_org, v_uid, 'role_revoked', auth.jwt()->>'session_id',
          jsonb_build_object('assignment_id', p_assignment));
  perform public.append_audit('update', 'role_assignments', p_assignment::text,
          jsonb_build_object('revoked', true)::text);
end;
$$;

create or replace function public.suspend_membership(p_user uuid, p_suspended boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.current_org_id();
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if exists (select 1 from public.organizations
              where id = v_org and owner_user_id = p_user) then
    raise exception 'CANNOT_SUSPEND_OWNER' using errcode = 'P0001';
  end if;
  update public.org_memberships
     set status = case when p_suspended then 'suspended' else 'active' end
   where org_id = v_org and user_id = p_user;
  if not found then raise exception 'MEMBERSHIP_NOT_FOUND' using errcode = 'P0001'; end if;

  insert into public.auth_events (org_id, user_id, event, session_id, detail)
  values (v_org, p_user, 'membership_suspended', auth.jwt()->>'session_id',
          jsonb_build_object('suspended', p_suspended));
  perform public.append_audit('update', 'org_memberships', p_user::text,
          jsonb_build_object('suspended', p_suspended)::text);
end;
$$;

-- Returns the raw token ONCE; only the SHA-256 is stored.
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
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
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
     where m.org_id = v_org and m.status = 'active'
       and lower(p.email) = v_email
  ) then
    raise exception 'ACCOUNT_ALREADY_ACTIVE' using errcode = 'P0001';
  end if;

  update public.invitations
     set status = 'revoked', revoked_at = now()
   where org_id = v_org and email_key = v_email and status = 'sent';

  v_raw := encode(gen_random_bytes(32), 'hex');
  insert into public.invitations
    (org_id, email, role_key, role_instance_id, token_hash, created_by, status)
  values
    (v_org, v_email, p_role_key, p_role_instance,
     encode(digest(v_raw, 'sha256'), 'hex'), auth.uid(), 'sent')
  returning id into v_id;

  perform public.append_audit('invite', 'invitation', v_id::text,
          jsonb_build_object('email', v_email, 'role_key', p_role_key)::text);
  return v_raw;
end;
$$;

create or replace function public.accept_invitation(p_token text)
returns jsonb language plpgsql security definer
set search_path = public, extensions as $$
declare
  v_uid   uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt()->>'email', ''));
  v_inv   public.invitations%rowtype;
  v_mem   uuid;
  v_inst  uuid;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED' using errcode = '42501'; end if;
  if p_token is null or length(p_token) < 32 then
    raise exception 'INVALID_INVITATION' using errcode = 'P0001';
  end if;

  select * into v_inv from public.invitations
   where token_hash = encode(digest(p_token, 'sha256'), 'hex')
   for update;
  if not found then raise exception 'INVALID_INVITATION' using errcode = 'P0001'; end if;

  if v_inv.status = 'sent' and v_inv.expires_at <= now() then
    raise exception 'INVITATION_EXPIRED' using errcode = 'P0001';
  end if;
  if v_inv.status <> 'sent' then
    raise exception 'INVALID_INVITATION' using errcode = 'P0001';
  end if;
  if v_email = '' or v_inv.email_key <> v_email then
    raise exception 'INVITATION_EMAIL_MISMATCH' using errcode = '42501';
  end if;

  insert into public.org_memberships (org_id, user_id, status, created_by)
  values (v_inv.org_id, v_uid, 'active', v_inv.created_by)
  on conflict (org_id, user_id) do update set status = 'active'
  returning id into v_mem;

  v_inst := v_inv.role_instance_id;
  if v_inst is null then
    select i.id into v_inst
      from public.org_role_instances i
     where i.org_id = v_inv.org_id and i.role_key = v_inv.role_key
       and i.status = 'active'
       and not exists (select 1 from public.role_assignments ra
                        where ra.role_instance_id = i.id and ra.revoked_at is null)
     order by i.slot_no
     limit 1;
  end if;
  if v_inst is null then
    raise exception 'NO_FREE_ROLE_SLOT' using errcode = 'P0001';
  end if;

  insert into public.role_assignments (org_id, membership_id, role_instance_id, assigned_by)
  values (v_inv.org_id, v_mem, v_inst, v_inv.created_by);

  update public.invitations
     set status = 'accepted', accepted_at = now(), accepted_by = v_uid
   where id = v_inv.id;

  perform set_config('app.identity_privileged', 'on', true);
  update public.profiles
     set verified = true,
         disabled_at = null,
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

create or replace function public.decline_invitation(p_token text)
returns void language plpgsql security definer
set search_path = public, extensions as $$
declare
  v_email text := lower(coalesce(auth.jwt()->>'email', ''));
  v_inv   public.invitations%rowtype;
begin
  select * into v_inv from public.invitations
   where token_hash = encode(digest(p_token, 'sha256'), 'hex') for update;
  if not found or v_inv.status <> 'sent' then
    raise exception 'INVALID_INVITATION' using errcode = 'P0001';
  end if;
  if v_email = '' or v_inv.email_key <> v_email then
    raise exception 'INVITATION_EMAIL_MISMATCH' using errcode = '42501';
  end if;

  update public.invitations
     set status = 'declined', declined_at = now()
   where id = v_inv.id;

  insert into public.auth_events (org_id, user_id, event, session_id, detail)
  values (v_inv.org_id, auth.uid(), 'invite_declined', auth.jwt()->>'session_id',
          jsonb_build_object('invitation_id', v_inv.id));
  perform public.append_audit('update', 'invitation', v_inv.id::text,
          jsonb_build_object('status', 'declined')::text);
end;
$$;

create or replace function public.revoke_invitation(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.current_org_id();
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  update public.invitations set status = 'revoked', revoked_at = now()
   where id = p_id and org_id = v_org and status = 'sent';
  if not found then raise exception 'INVITATION_NOT_FOUND' using errcode = 'P0001'; end if;
  perform public.append_audit('revoke', 'invitation', p_id::text, null);
end;
$$;

-- So admin lists tell the truth without a scheduled job.
create or replace function public.expire_invitations()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_n int;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  update public.invitations set status = 'expired'
   where org_id = public.current_org_id()
     and status = 'sent' and expires_at <= now();
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Join requests (the "share my org code" path)
-- ---------------------------------------------------------------------------
create table if not exists public.org_join_requests (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  note       text,
  status     text not null default 'pending'
             check (status in ('pending','approved','declined','withdrawn')),
  created_at timestamptz not null default now(),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz
);
create unique index if not exists join_requests_pending_idx
  on public.org_join_requests (org_id, user_id) where status = 'pending';

create or replace function public.request_join(p_org_code text, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_id  uuid;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles
                  where id = v_uid and verified and disabled_at is null) then
    raise exception 'ACCOUNT_NOT_VERIFIED' using errcode = '42501';
  end if;

  select id into v_org from public.organizations
   where upper(org_code) = upper(btrim(p_org_code)) and status = 'active';
  if v_org is null then raise exception 'ORG_NOT_FOUND' using errcode = 'P0001'; end if;

  if exists (select 1 from public.org_memberships
              where org_id = v_org and user_id = v_uid and status = 'active') then
    raise exception 'ALREADY_A_MEMBER' using errcode = 'P0001';
  end if;

  begin
    insert into public.org_join_requests (org_id, user_id, note)
    values (v_org, v_uid, nullif(btrim(p_note), ''))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'REQUEST_ALREADY_PENDING' using errcode = 'P0001';
  end;

  insert into public.auth_events (org_id, user_id, event, session_id, detail)
  values (v_org, v_uid, 'join_requested', auth.jwt()->>'session_id',
          jsonb_build_object('request_id', v_id));
  return v_id;
end;
$$;

create or replace function public.decide_join_request(
  p_id uuid, p_approve boolean, p_role_instance uuid default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_org  uuid := public.current_org_id();
  v_req  public.org_join_requests%rowtype;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;

  select * into v_req from public.org_join_requests
   where id = p_id and org_id = v_org and status = 'pending'
   for update;
  if not found then raise exception 'REQUEST_NOT_FOUND' using errcode = 'P0001'; end if;

  if p_approve then
    if p_role_instance is null then
      raise exception 'ROLE_SLOT_REQUIRED' using errcode = 'P0001';
    end if;
    perform public.assign_role(v_req.user_id, p_role_instance);
  end if;

  update public.org_join_requests
     set status = case when p_approve then 'approved' else 'declined' end,
         decided_by = auth.uid(), decided_at = now()
   where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Ownership + organisation lifecycle
-- ---------------------------------------------------------------------------
create or replace function public.transfer_ownership(p_new_owner uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_org  uuid := public.current_org_id();
  v_inst uuid;
begin
  if not public.is_org_owner(v_org) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if not public.has_recent_mfa() then
    raise exception 'STEP_UP_REQUIRED' using errcode = '42501';
  end if;
  if not exists (select 1 from public.org_memberships
                  where org_id = v_org and user_id = p_new_owner and status = 'active') then
    raise exception 'NOT_AN_ACTIVE_MEMBER' using errcode = 'P0001';
  end if;

  select id into v_inst from public.org_role_instances
   where org_id = v_org and role_key = 'admin' and status = 'active'
   order by slot_no limit 1;
  if v_inst is null then
    insert into public.org_role_instances (org_id, role_key, slot_no, label, created_by)
    values (v_org, 'admin', 1, 'Admin-1', auth.uid())
    returning id into v_inst;
  end if;

  begin
    insert into public.role_assignments (org_id, membership_id, role_instance_id, assigned_by)
    select v_org, m.id, v_inst, auth.uid()
      from public.org_memberships m
     where m.org_id = v_org and m.user_id = p_new_owner;
  exception when unique_violation then
    null; -- already holds the admin slot
  end;

  update public.organizations set owner_user_id = p_new_owner where id = v_org;
  perform public.sync_legacy_profile(p_new_owner);

  insert into public.auth_events (org_id, user_id, event, session_id, detail)
  values (v_org, p_new_owner, 'ownership_transferred', auth.jwt()->>'session_id',
          jsonb_build_object('from', auth.uid()));
  perform public.append_audit('update', 'organizations', v_org::text,
          jsonb_build_object('owner_user_id', p_new_owner)::text);
end;
$$;

create or replace function public.archive_organization(p_confirm text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.current_org_id();
begin
  if not public.is_org_owner(v_org) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_confirm is distinct from 'ARCHIVE' then
    raise exception 'CONFIRMATION_REQUIRED' using errcode = 'P0001';
  end if;

  update public.organizations
     set status = 'archived', archived_at = now()
   where id = v_org;
  update public.profiles set active_org_id = null
   where active_org_id = v_org;

  insert into public.auth_events (org_id, user_id, event, session_id, detail)
  values (v_org, auth.uid(), 'org_archived', auth.jwt()->>'session_id', '{}'::jsonb);
  perform public.append_audit('update', 'organizations', v_org::text,
          jsonb_build_object('status', 'archived')::text);
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. RLS + grants for the new tables: membership writes are RPC-only
-- ---------------------------------------------------------------------------
alter table public.org_memberships    enable row level security;
alter table public.org_role_instances enable row level security;
alter table public.role_assignments   enable row level security;
alter table public.org_join_requests  enable row level security;

-- A user must be able to read their own membership rows across orgs (that is
-- what an org switcher lists). Same rule for the orgs they belong to, without
-- widening org-bounded reads anywhere else. Security definer avoids nesting RLS
-- policies inside each other.
create or replace function public.is_org_member(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.org_memberships m
    where m.org_id = p_org and m.user_id = auth.uid() and m.status = 'active'
  );
$$;

drop policy if exists orgs_member on public.organizations;
create policy orgs_member on public.organizations
  for select using (
    id = public.current_org_id() or public.is_org_member(organizations.id)
  );

create policy org_memberships_read on public.org_memberships
  for select using (user_id = auth.uid() or org_id = public.current_org_id());
create policy org_role_instances_read on public.org_role_instances
  for select using (org_id = public.current_org_id());
create policy role_assignments_read on public.role_assignments
  for select using (org_id = public.current_org_id());
drop policy if exists invitations_admin_read on public.invitations;
create policy invitations_admin_read on public.invitations
  for select using (org_id = public.current_org_id() and public.is_admin());
create policy join_requests_read on public.org_join_requests
  for select using (user_id = auth.uid()
                 or (org_id = public.current_org_id() and public.is_admin()));

revoke insert, update, delete, truncate on
  public.org_memberships, public.org_role_instances, public.role_assignments,
  public.org_join_requests, public.role_permissions
  from anon, authenticated;
grant select on
  public.org_memberships, public.org_role_instances, public.role_assignments,
  public.org_join_requests, public.role_permissions
  to authenticated;

-- ---------------------------------------------------------------------------
-- 11. Backfill assertions — refuse to commit on a bad migration
-- ---------------------------------------------------------------------------
do $$
declare
  v_bad_profiles int;
  v_bad_orgs     int;
  v_role_drift   int;
begin
  select count(*) into v_bad_profiles
    from public.profiles p
   where p.org_id is not null
     and not exists (
       select 1
         from public.org_memberships m
         join public.role_assignments ra on ra.membership_id = m.id and ra.revoked_at is null
        where m.user_id = p.id and m.org_id = p.org_id);

  select count(*) into v_bad_orgs
    from public.organizations o
   where o.status = 'active'
     and exists (select 1 from public.profiles p where p.org_id = o.id)
     and (o.owner_user_id is null
          or o.org_code is null
          or not exists (select 1 from public.org_role_instances i
                          where i.org_id = o.id and i.role_key = 'admin'
                            and i.status = 'active'));

  select count(*) into v_role_drift
    from public.profiles p
    join public.org_memberships m on m.user_id = p.id and m.org_id = p.org_id
    join public.role_assignments ra on ra.membership_id = m.id and ra.revoked_at is null
    join public.org_role_instances i on i.id = ra.role_instance_id
   where i.role_key <> p.role;

  if v_bad_profiles > 0 or v_bad_orgs > 0 or v_role_drift > 0 then
    raise exception
      'BACKFILL_FAILED profiles=% orgs=% role_drift=%',
      v_bad_profiles, v_bad_orgs, v_role_drift
      using errcode = 'P0001';
  end if;
end;
$$;

-- Expected after commit, on the current project (1 org, 6 profiles):
--   org_memberships 6, org_role_instances 5 (admin/doctor x2/lab/nurse/reception),
--   role_assignments 6, organizations.owner_user_id = admin@www.clinic,
--   every profiles.active_org_id non-null.
