-- ============================================================================
-- 0001_init.sql — schema, RLS, helpers for Wellness with Writingale EMR
-- Domain mirrors src/types.ts. Patients/staff belong to an org; the 5 demo
-- roles (doctor/nurse/reception/admin/lab) map to profiles.role.
-- ============================================================================

create extension if not exists "pgcrypto";      -- gen_random_uuid()
create extension if not exists "pgjwt";          -- nullable JWT helpers if needed

-- ---------------------------------------------------------------------------
-- Profiles: 1:1 with auth.users. Holds the EHR role + org tenancy.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  org_id      uuid not null,
  full_name   text not null,
  email       text not null unique,
  role        text not null
                check (role in ('doctor','nurse','reception','admin','lab')),
  verified    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Orgs (tenancy root). Free tier: one org per deployment; multi-tenant ready.
create table if not exists public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Patients (PHI). One org owns them; staff query via RLS.
-- ---------------------------------------------------------------------------
create table if not exists public.patients (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organizations (id) on delete cascade,
  mrn               text not null,
  first_name        text not null,
  last_name         text not null,
  preferred_name    text,
  date_of_birth     date not null,
  gender            text not null check (gender in ('Male','Female','Non-binary')),
  pronouns          text not null default '',
  blood_type        text,
  phone             text,
  email             text,
  address           text,
  status            text not null default 'Outpatient'
                    check (status in ('Admitted','Outpatient','Discharged','ICU','Observation')),
  acuity            text not null default 'Stable'
                    check (acuity in ('Critical','Serious','Stable','Fair')),
  primary_physician text,
  room              text,
  department        text,
  insurance         text,
  height_cm         numeric,
  weight_kg         numeric,
  avatar_color      text,
  code_status       text not null default 'Full Code'
                    check (code_status in ('Full Code','DNR','DNI','Comfort Care')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (org_id, mrn)
);

-- Clinical children. Stored as normalized rows (not JSONB blobs) so RLS + audit
-- apply per-record. Each FK cascades to the patient.
create table if not exists public.allergies (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients (id) on delete cascade,
  substance text not null, reaction text, severity text, noted timestamptz default now()
);
create table if not exists public.medications (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients (id) on delete cascade,
  name text not null, dose text, route text, frequency text,
  status text default 'Active' check (status in ('Active','Hold','Discontinued')),
  start_date date, prescribed_by text, class text
);
create table if not exists public.labs (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients (id) on delete cascade,
  name text not null, value text, unit text, range text,
  flag text default 'Normal' check (flag in ('Normal','High','Low','Critical')),
  category text, collected timestamptz default now()
);
create table if not exists public.vitals (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients (id) on delete cascade,
  recorded_at timestamptz default now(),
  temp numeric, hr numeric, bp_sys numeric, bp_dia numeric, rr numeric, spo2 numeric, pain numeric
);
create table if not exists public.history (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients (id) on delete cascade,
  event_date date not null, title text not null, type text, description text, provider text
);
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients (id) on delete cascade,
  note_date timestamptz default now(), author text, author_role text,
  note_type text, content text
);
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients (id) on delete cascade,
  type text not null check (type in ('Medication','Laboratory','Imaging','Referral','Nursing')),
  name text not null, detail text, priority text default 'Routine' check (priority in ('Routine','STAT','Urgent')),
  status text default 'Pending' check (status in ('Pending','Active','Completed','Cancelled')),
  ordered_at timestamptz default now(), ordered_by uuid references profiles (id),
  administered text default 'Pending' check (administered in ('Pending','Administered','Not Administered')),
  recipient_name text
);
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  subject text not null, body text, from_profile uuid references profiles (id),
  from_role text, priority text default 'Normal' check (priority in ('Normal','High','Urgent')),
  category text, read boolean default false, created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- Audit log (append-only). Writes go through a SECURITY DEFINER fn so the real
-- actor (auth.uid()) is captured even when called from client RPCs.
-- ---------------------------------------------------------------------------
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid,
  actor_id uuid references auth.users (id),
  action text not null,
  entity text not null,
  entity_id text not null,
  detail text,
  created_at timestamptz not null default now()
);
-- Append-only: no UPDATE/DELETE policies for non-admin. Index for recent-first.
create index if not exists audit_log_created_at_idx on audit_log (created_at desc);
create index if not exists audit_log_entity_idx on audit_log (entity, entity_id);

-- ---------------------------------------------------------------------------
-- Share links (one-time, external read). Token is random; not the PK.
-- ---------------------------------------------------------------------------
create table if not exists public.shares (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients (id) on delete cascade,
  recipient_email text not null,
  token text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed boolean not null default false
);
create index if not exists shares_token_idx on shares (token);

-- ---------------------------------------------------------------------------
-- Indexes for the hot paths (patient list, orders by patient, labs by patient)
-- ---------------------------------------------------------------------------
create index if not exists patients_org_status_idx on patients (org_id, status);
create index if not exists orders_patient_idx on orders (patient_id);
create index if not exists labs_patient_idx on labs (patient_id);
create index if not exists meds_patient_idx on medications (patient_id);

-- ============================================================================
-- Helpers
-- ============================================================================

-- Org of the caller (cached from profiles). Used by every RLS policy.
create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from public.profiles where id = auth.uid();
$$;

-- True if caller is an admin in their org.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Auto-create a profile row when a new auth user signs up (trigger).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  -- ponytail: demo bootstraps one org (see seed). Production: org chosen at
  -- invite time; pass org_id via raw_user_meta_data or an invites table.
  select id into v_org from public.organizations order by created_at limit 1;
  insert into public.profiles (id, org_id, full_name, email, role, verified)
  values (
    new.id,
    coalesce(v_org, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'doctor'),
    false
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Append-only audit writer (SECURITY DEFINER captures auth.uid() reliably).
create or replace function public.append_audit(
  p_action text, p_entity text, p_entity_id text, p_detail text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_log (org_id, actor_id, action, entity, entity_id, detail)
  values (public.current_org_id(), auth.uid(), p_action, p_entity, p_entity_id, p_detail);
end;
$$;

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.patients enable row level security;
alter table public.allergies enable row level security;
alter table public.medications enable row level security;
alter table public.labs enable row level security;
alter table public.vitals enable row level security;
alter table public.history enable row level security;
alter table public.notes enable row level security;
alter table public.orders enable row level security;
alter table public.messages enable row level security;
alter table public.audit_log enable row level security;
alter table public.shares enable row level security;

-- Profiles: a user sees their own row; admins see their org's.
create policy profiles_self on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_admin on public.profiles
  for select using (org_id = public.current_org_id() and public.is_admin());

-- Organizations: members read their own org; admins manage.
create policy orgs_member on public.organizations
  for select using (id = public.current_org_id());
create policy orgs_admin on public.organizations
  for all using (id = public.current_org_id() and public.is_admin())
  with check (id = public.current_org_id() and public.is_admin());

-- Clinical data: any authenticated member of the patient's org.
-- (Fine-grained role scoping — e.g. reception can't read notes — is a follow-up
-- policy layer; the org boundary is the security floor.)
create policy patients_org on public.patients
  for all using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());

-- Child tables: key off the patient's org via a subquery (no join in USING
-- clause, which PG disallows).
create policy allergies_org on public.allergies
  for all using (
    (select org_id from public.patients p where p.id = patient_id) = public.current_org_id()
  );
create policy meds_org on public.medications
  for all using (
    (select org_id from public.patients p where p.id = patient_id) = public.current_org_id()
  );
create policy labs_org on public.labs
  for all using (
    (select org_id from public.patients p where p.id = patient_id) = public.current_org_id()
  );
create policy vitals_org on public.vitals
  for all using (
    (select org_id from public.patients p where p.id = patient_id) = public.current_org_id()
  );
create policy history_org on public.history
  for all using (
    (select org_id from public.patients p where p.id = patient_id) = public.current_org_id()
  );
create policy notes_org on public.notes
  for all using (
    (select org_id from public.patients p where p.id = patient_id) = public.current_org_id()
  );
create policy orders_org on public.orders
  for all using (
    (select org_id from public.patients p where p.id = patient_id) = public.current_org_id()
  );

-- Messages: org members see org messages.
create policy messages_org on public.messages
  for all using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());

-- Audit: org members read; only the SECURITY DEFINER fn writes (no client INSERT
-- policy), so the actor cannot be spoofed. Admins read org-wide.
create policy audit_read on public.audit_log
  for select using (org_id = public.current_org_id() or public.is_admin());

-- Shares: staff of the patient's org can create/select; public token redemption
-- is handled by a SECURITY DEFINER RPC (see 0002), not by client RLS.
create policy shares_org on public.shares
  for all using (
    (select org_id from public.patients p where p.id = patient_id) = public.current_org_id()
  );
