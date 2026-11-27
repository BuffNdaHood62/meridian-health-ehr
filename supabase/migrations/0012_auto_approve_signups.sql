-- ============================================================================
-- 0012_auto_approve_signups.sql — testing access without an administrator
--
-- Decision (2026-11-27): public signup immediately creates verified tenancy and
-- the selected clinical role. The waiting-approval UI is removed. Admin remains
-- outside public signup: a requested admin role is clamped to reception here,
-- even if a caller bypasses the SPA.
--
-- Requires 0010. Apply after 0010 and before any future 0011 invite-only cutover;
-- 0011 intentionally replaces handle_new_user() with no-tenancy-at-creation.
-- This is a testing convenience, not a real-PHI go-live control (see R-25).
-- STATUS: applied to zdtaludwhxnjutosrnvi on 2026-11-27.
-- ============================================================================

create or replace function public.auto_approve_signup_profile(
  p_user uuid,
  p_requested_role text
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_profile public.profiles%rowtype;
  v_org uuid;
  v_role text;
  v_instance uuid;
  v_membership uuid;
  v_slot int;
  v_try int := 0;
begin
  select * into v_profile from public.profiles where id = p_user;
  if not found or v_profile.disabled_at is not null then
    return;
  end if;

  if p_requested_role in ('doctor', 'nurse', 'reception', 'lab') then
    v_role := p_requested_role;
  else
    v_role := 'reception';
  end if;

  select id into v_org
    from public.organizations
   where id = coalesce(v_profile.active_org_id, v_profile.org_id)
     and status = 'active';
  if v_org is null then
    select id into v_org
      from public.organizations
     where status = 'active'
     order by created_at
     limit 1;
  end if;
  if v_org is null then
    raise exception 'AUTO_APPROVE_NO_ORGANIZATION' using errcode = 'P0001';
  end if;

  select i.id into v_instance
    from public.org_role_instances i
   where i.org_id = v_org
     and i.role_key = v_role
     and i.status = 'active'
     and not exists (
       select 1 from public.role_assignments ra
        where ra.role_instance_id = i.id and ra.revoked_at is null
     )
   order by i.slot_no
   limit 1;

  if v_instance is null then
    loop
      v_try := v_try + 1;
      select coalesce(max(slot_no), 0) + 1 into v_slot
        from public.org_role_instances
       where org_id = v_org and role_key = v_role;
      if v_slot > 25 then
        raise exception 'ROLE_SLOT_LIMIT' using errcode = 'P0001';
      end if;

      begin
        insert into public.org_role_instances (org_id, role_key, slot_no, label)
        values (v_org, v_role, v_slot, initcap(v_role) || '-' || v_slot)
        returning id into v_instance;
        exit;
      exception when unique_violation then
        if v_try >= 5 then
          raise exception 'ROLE_SLOT_COLLISION' using errcode = 'P0001';
        end if;
      end;
    end loop;
  end if;

  insert into public.org_memberships (org_id, user_id, status)
  values (v_org, p_user, 'active')
  on conflict (org_id, user_id) do update set status = 'active'
  returning id into v_membership;

  insert into public.role_assignments
    (org_id, membership_id, role_instance_id, assigned_by)
  values
    (v_org, v_membership, v_instance, null)
  on conflict do nothing;

  perform set_config('app.identity_privileged', 'on', true);
  update public.profiles
     set org_id = v_org,
         active_org_id = coalesce(active_org_id, v_org),
         role = v_role,
         verified = true,
         disabled_at = null
   where id = p_user;
  perform set_config('app.identity_privileged', 'off', true);

  insert into public.auth_events (org_id, user_id, event, detail)
  values (
    v_org,
    p_user,
    'profile_approved',
    jsonb_build_object('mechanism', 'auto_signup', 'role', v_role)
  );
end;
$$;

revoke execute on function public.auto_approve_signup_profile(uuid, text)
  from public, anon, authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_requested text := new.raw_user_meta_data->>'role';
begin
  if v_requested = 'admin' then
    v_requested := 'reception';
  end if;

  select id into v_org
    from public.organizations
   where status = 'active'
   order by created_at
   limit 1;
  if v_org is null then
    raise exception 'AUTO_APPROVE_NO_ORGANIZATION' using errcode = 'P0001';
  end if;

  insert into public.profiles
    (id, org_id, active_org_id, full_name, email, role, verified, requested_role)
  values
    (
      new.id,
      v_org,
      v_org,
      coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
      new.email,
      'reception',
      false,
      v_requested
    );

  perform public.auto_approve_signup_profile(new.id, v_requested);
  return new;
end;
$$;

-- Existing testers who were waiting for approval get the same treatment.
do $$
declare
  v_pending record;
begin
  for v_pending in
    select p.id, coalesce(p.requested_role, 'reception') as role
      from public.profiles p
     where not p.verified
       and p.disabled_at is null
  loop
    perform public.auto_approve_signup_profile(v_pending.id, v_pending.role);
  end loop;
end;
$$;
