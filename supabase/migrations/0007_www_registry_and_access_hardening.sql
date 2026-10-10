-- ============================================================================
-- 0007_www_registry_and_access_hardening.sql
--
-- Phase 1/2 of the production roadmap:
--   1. Server-side home for the WWW client registry (previously browser
--      localStorage only — see src/utils/wwwRecords.ts, demographics.ts,
--      medicalReviews.ts).
--   2. Race-safe WWW number allocation (001-999 per org) — was a client-side
--      "max+1" scan that breaks with two front desks.
--   3. Action-scoped RLS replacing 0004's coarse `for all` policies, which let
--      any org member with a role grant UPDATE/DELETE every PHI row.
--   4. Immutability enforcement for records the UI already promises are
--      "permanent / cannot be edited", plus a no-content-rewrite guard on
--      signed orders.
--   5. Tamper-evident (hash-chained) audit trail.
--
-- STATUS: authored, NOT APPLIED. Run against a STAGING project first
-- (`supabase link --project-ref <staging> && supabase db push`), then execute
-- the RLS matrix assertions at the bottom of this file as a smoke test.
-- Do not apply to a project holding real PHI without a tested restore point.
-- ============================================================================

-- pg_trgm backs the client-name search index below; declare it up front so the
-- index statement never depends on statement order.
create extension if not exists pg_trgm;

create extension if not exists pgcrypto;  -- digest() for the audit hash chain

-- ---------------------------------------------------------------------------
-- 1. Registry tables
-- ---------------------------------------------------------------------------

-- One row per human client. www_number is allocated once and never changes.
create table if not exists public.www_clients (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  www_number    text not null,
  client_name   text not null,
  -- Normalized identity so a repeat visit reuses the number regardless of
  -- casing/extra spaces typed at the front desk.
  client_key    text generated always as (lower(btrim(client_name))) stored,
  created_at    timestamptz not null default now(),
  created_by    uuid references auth.users (id),
  unique (org_id, www_number),
  unique (org_id, client_key)
);

-- The immutable visit register: one row per encounter, append-only.
-- supersedes_id is the clinical correction path — you cannot edit a saved
-- record, you add a new one that points at the record it corrects.
create table if not exists public.www_client_visits (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references public.www_clients (id) on delete restrict,
  org_id            uuid not null references public.organizations (id) on delete restrict,
  age_band          text check (age_band in
                    ('Below 1 year','1-4 years','5-9 years','10-12 years','13-19 years','Above 20 years','')),
  facility          text not null default '',
  status            text check (status in ('Admitted','Not admitted','')),
  complaints        text not null default '',
  allergies         text not null default '',
  diagnosis         text,
  -- Biography is denormalized onto the visit on purpose: the saved record must
  -- read the same in ten years as it did the day it was written, even if the
  -- client's demographics are later corrected.
  biography         jsonb not null default '{}'::jsonb,
  temp_c            numeric check (temp_c is null or (temp_c >= 30 and temp_c <= 45)),
  spo2_pct          numeric check (spo2_pct is null or (spo2_pct >= 50 and spo2_pct <= 100)),
  bp_sys            numeric check (bp_sys  is null or (bp_sys  >= 60  and bp_sys  <= 260)),
  bp_dia            numeric check (bp_dia  is null or (bp_dia  >= 30  and bp_dia  <= 180)),
  pulse_bpm         numeric check (pulse_bpm is null or (pulse_bpm >= 30 and pulse_bpm <= 250)),
  resp_rate         numeric check (resp_rate is null or (resp_rate >= 6 and resp_rate <= 60)),
  weight_kg         numeric check (weight_kg is null or (weight_kg >= 0.3 and weight_kg <= 400)),
  height_cm         numeric check (height_cm is null or (height_cm >= 20 and height_cm <= 260)),
  visit_at          timestamptz not null default now(),
  source            text not null default 'entry' check (source in ('entry','review')),
  supersedes_id     uuid references public.www_client_visits (id),
  recorded_by       uuid references auth.users (id),
  recorded_at       timestamptz not null default now()
);

create index if not exists www_visits_client_idx  on public.www_client_visits (client_id, visit_at desc);
create index if not exists www_visits_org_idx     on public.www_client_visits (org_id);
create index if not exists www_clients_name_idx   on public.www_clients using gin (client_name gin_trgm_ops);

-- Editable biography of record (the one place the registry may be corrected).
create table if not exists public.www_client_demographics (
  client_id        uuid primary key references public.www_clients (id) on delete cascade,
  org_id           uuid not null references public.organizations (id) on delete cascade,
  dob              date,
  occupation       text,
  address          text,
  next_of_kin      text,
  next_of_kin_phone text,
  mother_name      text,
  mother_phone     text,
  father_name      text,
  father_phone     text,
  email            text,
  phone            text,
  updated_at       timestamptz not null default now(),
  updated_by       uuid references auth.users (id)
);

-- Physician medical review, append-only (surfaces on Clients + History).
create table if not exists public.medical_reviews (
  id                 uuid primary key default gen_random_uuid(),
  client_id          uuid not null references public.www_clients (id) on delete restrict,
  org_id             uuid not null references public.organizations (id) on delete restrict,
  diagnosis          text not null,
  history_of_events  text not null default '',
  vitals             jsonb not null default '{}'::jsonb,
  reviewed_by        uuid references auth.users (id),
  reviewed_at        timestamptz not null default now()
);

-- Administration trail: one row per administration EVENT (never updated).
create table if not exists public.order_administrations (
  id               uuid primary key default gen_random_uuid(),
  order_id         text not null,
  org_id           uuid not null references public.organizations (id) on delete restrict,
  status           text not null check (status in ('Pending','Administered','Not Administered')),
  recipient_name   text,
  administered_by  uuid references auth.users (id),
  administered_at  timestamptz not null default now(),
  note             text
);
create index if not exists order_admin_order_idx on public.order_administrations (order_id);

-- ---------------------------------------------------------------------------
-- 2. WWW number allocation (per org, zero-padded, serialized)
-- ---------------------------------------------------------------------------
create table if not exists public.www_number_counters (
  org_id      uuid primary key references public.organizations (id) on delete cascade,
  next_value  int not null default 1 check (next_value >= 1)
);

-- Returns the client id for `p_client_name`, allocating a fresh WWW number on
-- first use. SECURITY DEFINER so the counter row lock serializes concurrent
-- front-desk entries; 001-999 exhaustion is a hard error, not a silent reuse.
create or replace function public.register_www_client(p_client_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org  uuid := public.current_org_id();
  v_key  text := lower(btrim(p_client_name));
  v_id   uuid;
  v_num  int;
begin
  if v_org is null then
    raise exception 'no organization on the caller profile';
  end if;
  if btrim(v_key) = '' then
    raise exception 'client name is required';
  end if;

  select id into v_id from public.www_clients
    where org_id = v_org and client_key = v_key;
  if found then
    return v_id;
  end if;

  insert into public.www_number_counters (org_id) values (v_org)
    on conflict (org_id) do nothing;

  -- Row lock: two clerks saving at the same instant cannot both take 007.
  select next_value into v_num from public.www_number_counters
    where org_id = v_org for update;

  if v_num > 999 then
    raise exception 'WWW number pool exhausted (001-999) — allocation policy change required';
  end if;

  update public.www_number_counters set next_value = v_num + 1 where org_id = v_org;

  insert into public.www_clients (org_id, www_number, client_name, created_by)
    values (v_org, lpad(v_num::text, 3, '0'), btrim(p_client_name), auth.uid())
    returning id into v_id;

  insert into public.www_client_demographics (client_id, org_id)
    values (v_id, v_org) on conflict (client_id) do nothing;

  insert into public.audit_log (org_id, actor_id, action, entity, entity_id, detail)
    values (v_org, auth.uid(), 'create', 'www_client', v_id::text, 'WWW ' || lpad(v_num::text, 3, '0'));

  return v_id;
end;
$$;

-- Record one visit. Vitals arrive as one jsonb object so the client form and
-- the RPC share a shape; out-of-range values fail the column CHECKs above.
create or replace function public.record_client_visit(
  p_client_name text,
  p_age_band text default '',
  p_facility text default '',
  p_status text default '',
  p_complaints text default '',
  p_allergies text default '',
  p_diagnosis text default null,
  p_vitals jsonb default '{}'::jsonb,
  p_biography jsonb default '{}'::jsonb,
  p_visit_at timestamptz default now(),
  p_supersedes uuid default null
)
returns public.www_client_visits
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client uuid := public.register_www_client(p_client_name);
  v_org    uuid := public.current_org_id();
  v_row    public.www_client_visits;
begin
  insert into public.www_client_visits (
    client_id, org_id, age_band, facility, status, complaints, allergies, diagnosis,
    biography, temp_c, spo2_pct, bp_sys, bp_dia, pulse_bpm, resp_rate, weight_kg, height_cm,
    visit_at, source, supersedes_id, recorded_by
  ) values (
    v_client, v_org, p_age_band, p_facility, p_status, p_complaints, p_allergies, p_diagnosis,
    p_biography,
    nullif(p_vitals->>'tempC','')::numeric,      nullif(p_vitals->>'spo2Pct','')::numeric,
    nullif(p_vitals->>'bpSys','')::numeric,      nullif(p_vitals->>'bpDia','')::numeric,
    nullif(p_vitals->>'pulseBpm','')::numeric,   nullif(p_vitals->>'respRate','')::numeric,
    nullif(p_vitals->>'weightKg','')::numeric,   nullif(p_vitals->>'heightCm','')::numeric,
    p_visit_at, 'entry', p_supersedes, auth.uid()
  ) returning * into v_row;

  insert into public.audit_log (org_id, actor_id, action, entity, entity_id, detail)
    values (v_org, auth.uid(), 'create', 'www_client_visit', v_row.id::text, 'visit recorded');

  return v_row;
end;
$$;

-- One transaction for the Dashboard Medical Review: review row + visit row, so
-- a saved review can never exist without landing on the client register.
create or replace function public.record_medical_review(
  p_client_name text,
  p_diagnosis text,
  p_history_of_events text,
  p_vitals jsonb default '{}'::jsonb,
  p_reviewed_at timestamptz default now()
)
returns public.medical_reviews
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client uuid := public.register_www_client(p_client_name);
  v_org    uuid := public.current_org_id();
  v_rev    public.medical_reviews;
begin
  if coalesce(btrim(p_diagnosis),'') = '' then
    raise exception 'diagnosis is required';
  end if;

  insert into public.medical_reviews (client_id, org_id, diagnosis, history_of_events, vitals, reviewed_by, reviewed_at)
    values (v_client, v_org, p_diagnosis, p_history_of_events, p_vitals, auth.uid(), p_reviewed_at)
    returning * into v_rev;

  perform public.record_client_visit(
    p_client_name => p_client_name,
    p_complaints => p_history_of_events,
    p_diagnosis => p_diagnosis,
    p_vitals => p_vitals,
    p_biography => coalesce((select to_jsonb(d) - 'client_id' - 'org_id' - 'updated_at' - 'updated_by'
                               from public.www_client_demographics d
                              where d.client_id = v_client), '{}'::jsonb),
    p_visit_at => p_reviewed_at
  );

  insert into public.audit_log (org_id, actor_id, action, entity, entity_id, detail)
    values (v_org, auth.uid(), 'create', 'medical_review', v_rev.id::text, 'review saved to register');

  return v_rev;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Immutability triggers
-- ---------------------------------------------------------------------------

-- A saved clinical record is not editable. To run a controlled correction,
-- drop the trigger, migrate, re-create it — and expect the audit trail to show
-- the gap. That friction is the feature.
create or replace function public.forbid_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception '% is append-only (%; migration must drop the trigger explicitly)',
    tg_table_name, tg_op;
end;
$$;

drop trigger if exists www_clients_immutable on public.www_clients;
create trigger www_clients_immutable
  before update or delete on public.www_clients
  for each row execute function public.forbid_mutation();

drop trigger if exists www_visits_immutable on public.www_client_visits;
create trigger www_visits_immutable
  before update or delete on public.www_client_visits
  for each row execute function public.forbid_mutation();

drop trigger if exists medical_reviews_immutable on public.medical_reviews;
create trigger medical_reviews_immutable
  before update or delete on public.medical_reviews
  for each row execute function public.forbid_mutation();

drop trigger if exists order_admin_immutable on public.order_administrations;
create trigger order_admin_immutable
  before update or delete on public.order_administrations
  for each row execute function public.forbid_mutation();

drop trigger if exists audit_immutable on public.audit_log;
create trigger audit_immutable
  before update or delete on public.audit_log
  for each row execute function public.forbid_mutation();

-- A signed order's clinical content must not change underneath the signature.
-- Status/administration bookkeeping may still move.
create or replace function public.forbid_order_content_rewrite()
returns trigger
language plpgsql
as $$
begin
  if old.ordered_at is not null and
     (new.name, new.detail, new.type, new.priority, new.patient_id)
   is distinct from
     (old.name, old.detail, old.type, old.priority, old.patient_id) then
    raise exception 'order % is signed: clinical content is immutable', old.id;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_content_immutable on public.orders;
create trigger orders_content_immutable
  before update on public.orders
  for each row execute function public.forbid_order_content_rewrite();

-- Biography edits are allowed but never silent.
create or replace function public.audit_demographics_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_log (org_id, actor_id, action, entity, entity_id, detail)
  values (new.org_id, auth.uid(), 'update', 'www_client_demographics', new.client_id::text,
          jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new))::text);
  return new;
end;
$$;

drop trigger if exists www_demographics_audit on public.www_client_demographics;
create trigger www_demographics_audit
  after update on public.www_client_demographics
  for each row execute function public.audit_demographics_change();

-- ---------------------------------------------------------------------------
-- 4. Tamper-evident audit chain
-- ---------------------------------------------------------------------------
-- Each row hashes the previous row's hash, so deleting or editing history
-- breaks the chain. Single-writer per transaction via an advisory lock;
-- revisit with per-org chain rows if audit write volume ever demands it.
alter table public.audit_log
  add column if not exists prev_hash text,
  add column if not exists row_hash  text;

create or replace function public.chain_audit_hash()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev text;
  v_payload text;
begin
  perform pg_advisory_xact_lock(hashtext('www_audit_chain'));

  select row_hash into v_prev from public.audit_log
    where row_hash is not null
    order by created_at desc, id desc
    limit 1;

  new.prev_hash := v_prev;
  v_payload := coalesce(v_prev,'') || '|' ||
    new.created_at::text || '|' || coalesce(new.org_id::text,'-') || '|' ||
    coalesce(new.actor_id::text,'-') || '|' || new.action || '|' || new.entity || '|' ||
    new.entity_id || '|' || coalesce(new.detail,'-');
  new.row_hash := encode(digest(v_payload, 'sha256'), 'hex');
  return new;
end;
$$;

drop trigger if exists audit_hash_chain on public.audit_log;
create trigger audit_hash_chain
  before insert on public.audit_log
  for each row execute function public.chain_audit_hash();

-- ---------------------------------------------------------------------------
-- 5. Action-scoped role matrix (replaces 0004's `for all` grants)
-- ---------------------------------------------------------------------------
create or replace function public.role_allows(p_entity text, p_action text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    (select role from public.profiles where id = auth.uid())

    -- Doctors own the clinical record. Still no DELETE anywhere.
    when 'doctor' then p_action in ('select','insert','update')

    -- Nurses: review and administer; they cannot author orders or edit charts.
    when 'nurse' then
      p_action = 'select'
      or (p_entity in ('order_administrations','vitals','notes','messages','alerts') and p_action = 'insert')
      or (p_entity = 'orders' and p_action = 'update')

    -- Lab techs: results in, clinical narrative stays closed.
    when 'lab' then
      p_action = 'select'
      or (p_entity in ('labs','messages') and p_action = 'insert')
      or (p_entity = 'labs' and p_action = 'update')

    -- Reception: intake and scheduling only.
    when 'reception' then
      p_action = 'select'
      or (p_entity in ('www_clients','www_client_visits','www_client_demographics','appointments','messages','shares') and p_action = 'insert')
      or (p_entity in ('www_client_demographics','appointments','patients') and p_action = 'update')

    -- Admin: provisioning and audit review, never PHI deletion or PHI edits.
    when 'admin' then
      p_action = 'select'
      or (p_entity in ('profiles','organizations','www_number_counters') and p_action in ('insert','update'))

    else false
  end;
$$;

-- Drop the 0004/0005 catch-all policies, then re-grant per action.
drop policy if exists patients_rbac      on public.patients;
drop policy if exists allergies_rbac     on public.allergies;
drop policy if exists meds_rbac          on public.medications;
drop policy if exists labs_rbac          on public.labs;
drop policy if exists vitals_rbac        on public.vitals;
drop policy if exists history_rbac       on public.history;
drop policy if exists notes_rbac         on public.notes;
drop policy if exists orders_rbac        on public.orders;
drop policy if exists messages_rbac      on public.messages;
drop policy if exists alerts_org         on public.alerts;
drop policy if exists appts_org          on public.appointments;

-- Org-bounded read for every PHI table the app lists.
create policy patients_read on public.patients
  for select using (org_id = public.current_org_id() and public.role_allows('patients','select'));
create policy allergies_read on public.allergies
  for select using (public.role_allows('allergies','select') and exists (
    select 1 from public.patients p where p.id = allergies.patient_id and p.org_id = public.current_org_id()));
create policy medications_read on public.medications
  for select using (public.role_allows('medications','select') and exists (
    select 1 from public.patients p where p.id = medications.patient_id and p.org_id = public.current_org_id()));
create policy labs_read on public.labs
  for select using (public.role_allows('labs','select') and exists (
    select 1 from public.patients p where p.id = labs.patient_id and p.org_id = public.current_org_id()));
create policy vitals_read on public.vitals
  for select using (public.role_allows('vitals','select') and exists (
    select 1 from public.patients p where p.id = vitals.patient_id and p.org_id = public.current_org_id()));
create policy history_read on public.history
  for select using (public.role_allows('history','select') and exists (
    select 1 from public.patients p where p.id = history.patient_id and p.org_id = public.current_org_id()));
create policy notes_read on public.notes
  for select using (public.role_allows('notes','select') and exists (
    select 1 from public.patients p where p.id = notes.patient_id and p.org_id = public.current_org_id()));
create policy orders_read on public.orders
  for select using (public.role_allows('orders','select') and exists (
    select 1 from public.patients p where p.id = orders.patient_id and p.org_id = public.current_org_id()));
create policy messages_read on public.messages
  for select using (org_id = public.current_org_id() and public.role_allows('messages','select'));
create policy alerts_read on public.alerts
  for select using (org_id = public.current_org_id() and public.role_allows('alerts','select'));
create policy appointments_read on public.appointments
  for select using (org_id = public.current_org_id() and public.role_allows('appointments','select'));

-- Writes, per table, always org-bounded by the parent patient.
create policy labs_write on public.labs
  for insert with check (public.role_allows('labs','insert') and exists (
    select 1 from public.patients p where p.id = labs.patient_id and p.org_id = public.current_org_id()));
create policy labs_update on public.labs
  for update using (public.role_allows('labs','update') and exists (
    select 1 from public.patients p where p.id = labs.patient_id and p.org_id = public.current_org_id()));
create policy vitals_write on public.vitals
  for insert with check (public.role_allows('vitals','insert') and exists (
    select 1 from public.patients p where p.id = vitals.patient_id and p.org_id = public.current_org_id()));
create policy notes_write on public.notes
  for insert with check (public.role_allows('notes','insert') and exists (
    select 1 from public.patients p where p.id = notes.patient_id and p.org_id = public.current_org_id()));
create policy orders_write on public.orders
  for insert with check (public.role_allows('orders','insert') and exists (
    select 1 from public.patients p where p.id = orders.patient_id and p.org_id = public.current_org_id()));
create policy orders_update on public.orders
  for update using (public.role_allows('orders','update') and exists (
    select 1 from public.patients p where p.id = orders.patient_id and p.org_id = public.current_org_id()));
create policy patients_update on public.patients
  for update using (org_id = public.current_org_id() and public.role_allows('patients','update'));
create policy messages_write on public.messages
  for insert with check (org_id = public.current_org_id() and public.role_allows('messages','insert'));
create policy appointments_write on public.appointments
  for insert with check (org_id = public.current_org_id() and public.role_allows('appointments','insert'));
create policy appointments_update on public.appointments
  for update using (org_id = public.current_org_id() and public.role_allows('appointments','update'));
create policy alerts_write on public.alerts
  for insert with check (org_id = public.current_org_id() and public.role_allows('alerts','insert'));

-- Shares: staff create; consumption is RPC-only (0002 redeem_share), so no
-- update policy exists for client roles at all.
drop policy if exists shares_org on public.shares;
create policy shares_read on public.shares
  for select using (public.role_allows('shares','select') and exists (
    select 1 from public.patients p where p.id = shares.patient_id and p.org_id = public.current_org_id()));
create policy shares_write on public.shares
  for insert with check (public.role_allows('shares','insert') and exists (
    select 1 from public.patients p where p.id = shares.patient_id and p.org_id = public.current_org_id()));

-- Registry: writes go through the SECURITY DEFINER functions above for
-- transactional invariants; the direct-insert policies keep the org boundary for
-- clients that have no RPC path (demographics edits).
alter table public.www_clients            enable row level security;
alter table public.www_client_visits      enable row level security;
alter table public.www_client_demographics enable row level security;
alter table public.medical_reviews        enable row level security;
alter table public.order_administrations  enable row level security;
alter table public.www_number_counters    enable row level security;

create policy www_clients_read on public.www_clients
  for select using (org_id = public.current_org_id() and public.role_allows('www_clients','select'));
create policy www_clients_write on public.www_clients
  for insert with check (org_id = public.current_org_id() and public.role_allows('www_clients','insert'));

create policy www_visits_read on public.www_client_visits
  for select using (org_id = public.current_org_id() and public.role_allows('www_client_visits','select'));
create policy www_visits_write on public.www_client_visits
  for insert with check (org_id = public.current_org_id() and public.role_allows('www_client_visits','insert'));

create policy demographics_read on public.www_client_demographics
  for select using (org_id = public.current_org_id() and public.role_allows('www_client_demographics','select'));
create policy demographics_write on public.www_client_demographics
  for insert with check (org_id = public.current_org_id() and public.role_allows('www_client_demographics','insert'));
create policy demographics_update on public.www_client_demographics
  for update using (org_id = public.current_org_id() and public.role_allows('www_client_demographics','update'));

create policy reviews_read on public.medical_reviews
  for select using (org_id = public.current_org_id() and public.role_allows('medical_reviews','select'));
create policy reviews_write on public.medical_reviews
  for insert with check (org_id = public.current_org_id() and public.role_allows('medical_reviews','insert'));

create policy admin_read on public.order_administrations
  for select using (org_id = public.current_org_id() and public.role_allows('order_administrations','select'));
create policy admin_write on public.order_administrations
  for insert with check (org_id = public.current_org_id() and public.role_allows('order_administrations','insert'));

-- Counters are not readable by client roles at all; the RPC owns allocation.
create policy counters_admin on public.www_number_counters
  for select using (public.is_admin());

-- Audit trail: readable by admins (and their own actions by anyone), never
-- writable from a client role — only SECURITY DEFINER paths insert.
drop policy if exists audit_read on public.audit_log;
create policy audit_read on public.audit_log
  for select using (actor_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- 6. Grants: deny destructive DDL to client roles, explicitly.
-- ---------------------------------------------------------------------------
-- No DELETE/TRUNCATE anywhere from the app roles: hard-deleting a clinical
-- record is not a supported operation. Deactivate identities by flagging the
-- profile (role/verified) instead of deleting rows.
-- NOTE: `usage on schema public` stays with anon on purpose — anonymous share
-- links redeem through the 0002 SECURITY DEFINER RPC and would break without it.
revoke delete, truncate, references
  on all tables in schema public from anon, authenticated;
grant  select on all tables in schema public to authenticated;
alter default privileges in schema public revoke delete, truncate on tables from authenticated;

-- ---------------------------------------------------------------------------
-- 7. RLS-matrix smoke assertions (run manually on staging)
-- ---------------------------------------------------------------------------
-- Expect: nurse cannot insert an order; lab cannot read notes; reception cannot
-- read labs; any role cannot delete a visit; anon sees nothing.
--   begin; set local role authenticated; set local request.jwt.claims = '{"sub":"<nurse-uuid>"}';
--   insert into orders (patient_id,name,type,detail,priority,status,ordered_at) values (...);  -- must fail
--   reset role; rollback;
