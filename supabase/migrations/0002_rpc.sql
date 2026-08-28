-- ============================================================================
-- 0002_rpc.sql — public share redemption + passwordless helpers
-- ============================================================================

-- One-time share redemption for external recipients (no auth required).
-- SECURITY DEFINER so we can read the patient/org without the caller being a
-- member, then return a tight read-only projection and mark the share consumed.
-- Throws on invalid/expired/already-consumed token.
create or replace function public.redeem_share(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_share shares%rowtype;
  v_patient patients%rowtype;
begin
  select * into v_share from public.shares where token = p_token;
  if v_share is null then
    raise exception 'INVALID_SHARE' using errcode = 'P0001';
  end if;
  if v_share.consumed then
    raise exception 'ALREADY_CONSUMED' using errcode = 'P0001';
  end if;
  if v_share.expires_at < now() then
    raise exception 'EXPIRED' using errcode = 'P0001';
  end if;

  update public.shares set consumed = true where id = v_share.id;

  select * into v_patient from public.patients where id = v_share.patient_id;

  -- Minimal read-only projection: never leak full PHI to an external link.
  return jsonb_build_object(
    'patient_id', v_patient.id,
    'first_name', v_patient.first_name,
    'last_name', v_patient.last_name,
    'mrn', v_patient.mrn,
    'gender', v_patient.gender,
    'department', v_patient.department,
    'code_status', v_patient.code_status,
    'allergies', (
      select coalesce(jsonb_agg(jsonb_build_object('substance', a.substance, 'reaction', a.reaction, 'severity', a.severity)), '[]'::jsonb)
      from public.allergies a where a.patient_id = v_patient.id
    )
  );
end;
$$;

-- Grant the anon role EXECUTE so the public /share/:token route can call it.
grant execute on function public.redeem_share(text) to anon;

-- ----------------------------------------------------------------------------
-- Passwordless / OTP: enable in Supabase Studio (Auth > Providers > Email/Phone
-- OTP) — no SQL needed. The client calls supabase.auth.signInWithOtp({email}).
-- Magic-link + phone OTP both flow through auth.users; the handle_new_user
-- trigger still creates the profile on first confirmation.
-- ----------------------------------------------------------------------------

-- Email verification gate: set "Confirm email" + "Double confirm" in Studio so
-- profiles.verified flips naturally. This RPC lets an admin mark verified after
-- an out-of-band check (e.g. license review) without touching auth.
create or replace function public.verify_profile(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  update public.profiles set verified = true where id = p_user_id;
end;
$$;
