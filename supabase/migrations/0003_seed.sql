-- ============================================================================
-- 0003_seed.sql — demo org + 5 staff accounts + 2 sample patients
-- ponytail: seed accounts use Supabase's admin password hash via auth schema.
-- In a managed project, create users through the Dashboard / admin API (the
-- SQL below works on self-hosted / local CLI where you can insert into
-- auth.users + auth.identities). Password = "DemoPassw0rd!" for all five.
-- ============================================================================

-- 1) Org
insert into public.organizations (id, name, slug)
values ('11111111-1111-1111-1111-111111111111', 'Wellness with Writingale', 'www')
on conflict (id) do nothing;

-- 2) Staff accounts. We insert into auth.users with a bcrypt password hash and
--    let the handle_new_user trigger create the profile row. The password hash
--    format Supabase expects: "$2a$<cost>$<22-char-salt><31-char-hash>".
--    bcryptjs generates the "$2b$" variant; GoTrue accepts both prefixes.
--    Hash below is for "DemoPassw0rd!" (cost 10). Safe to commit ONLY because
--    this is a documented demo credential — never reuse these accounts for
--    real data.
do $$
declare
  v_pw_hash text := '$2b$10$eXdWwrR28isZf9DzZtQVre.Clx3s8c174s9/cc6SVsswYwb4Roi0.';
  v_email text;
  v_role text;
  v_name text;
  v_uid uuid;
begin
  -- (email, role, full_name)
  for v_email, v_role, v_name in
    values
      ('doctor@www.clinic', 'doctor',   'Dr. Sarah Chen'),
      ('nurse@www.clinic',  'nurse',    'Nurse Patel'),
      ('reception@www.clinic','reception','Ana Reyes'),
      ('admin@www.clinic',  'admin',    'Facility Admin'),
      ('lab@www.clinic',    'lab',      'Lab Tech Osei')
  loop
    v_uid := gen_random_uuid();
    if not exists (select 1 from auth.users where email = v_email) then
      insert into auth.users (
        id, instance_id, email, encrypted_password, raw_user_meta_data,
        email_confirmed_at, created_at, updated_at, role, aud
      )
      values (
        v_uid, '00000000-0000-0000-0000-000000000000', v_email, v_pw_hash,
        jsonb_build_object('full_name', v_name, 'role', v_role),
        now(), now(), now(), 'authenticated', 'authenticated'
      );
      -- provider_id is NOT NULL in the current cloud auth schema (older local
      -- CLI schemas omitted it); convention is the identity's `sub` claim.
      insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
      values (v_uid, v_uid, jsonb_build_object('sub', v_uid, 'email', v_email), 'email', v_uid::text, now(), now(), now());
      -- Normalize columns GoTrue expects on every user row:
      --  * token columns must be '' not NULL — NULL confirmation_token breaks
      --    hosted GoTrue's login query ("Database error querying schema").
      --  * raw_app_meta_data marks the email provider.
      --  * raw_user_meta_data carries sub/email like GoTrue-native rows.
      update auth.users set
        confirmation_token='', recovery_token='', email_change='', email_change_token_new='',
        raw_app_meta_data=jsonb_build_object('provider','email','providers',jsonb_build_array('email')),
        raw_user_meta_data=jsonb_build_object(
          'sub', v_uid::text, 'email', v_email, 'full_name', v_name, 'role', v_role,
          'email_verified', true, 'phone_verified', false)
      where id = v_uid;
    end if;
  end loop;

  -- Seed staff are pre-verified demo accounts: the verified gate (see
  -- auth-supabase.tsx) would otherwise lock them out of a fresh project.
  update public.profiles p set verified = true
  from auth.users u where p.id = u.id and u.email like '%@www.clinic';
end $$;

-- 3) Sample patients (org-owned). Mirrors the demo MRN scheme.
insert into public.patients (org_id, mrn, first_name, last_name, date_of_birth, gender, department, status, acuity, code_status, avatar_color, insurance)
values
  ('11111111-1111-1111-1111-111111111111', 'MRN-1001', 'Jordan', 'Avery', '1959-03-14', 'Male', 'ICU', 'ICU', 'Critical', 'DNI', '#ef4444', 'Medicare'),
  ('11111111-1111-1111-1111-111111111111', 'MRN-1002', 'Maria', 'Lopez', '1972-09-02', 'Female', 'Cardiology', 'Admitted', 'Serious', 'Full Code', '#13726c', 'Aetna')
on conflict do nothing;

insert into public.allergies (patient_id, substance, reaction, severity)
select id, 'Penicillin', 'Anaphylaxis', 'Severe' from public.patients where mrn = 'MRN-1001';

insert into public.orders (patient_id, type, name, detail, priority, status, ordered_by)
select p.id, 'Laboratory', 'CBC with Differential', 'QAM', 'Routine', 'Active',
       (select id from auth.users where email = 'doctor@www.clinic')
from public.patients p where p.mrn = 'MRN-1001';
