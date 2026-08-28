-- ============================================================================
-- 0005_alerts_appointments.sql — tables referenced by the data layer
-- ============================================================================
create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  patient_id uuid references patients (id) on delete cascade,
  patient_name text,
  initials text,
  avatar_color text,
  type text,
  message text,
  time timestamptz default now(),
  severity text default 'Info' check (severity in ('Critical','Warning','Info'))
);
create index if not exists alerts_org_idx on alerts (org_id);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  patient_id uuid references patients (id) on delete cascade,
  patient_name text,
  patient_initials text,
  avatar_color text,
  time timestamptz,
  duration_min int default 30,
  type text,
  department text,
  status text default 'Scheduled' check (status in ('Scheduled','Checked-in','In Progress','Completed','Cancelled','No-show')),
  notes text
);
create index if not exists appts_org_idx on appointments (org_id);

-- Enable RLS on the new tables (org-scoped, like the rest).
alter table public.alerts enable row level security;
alter table public.appointments enable row level security;
create policy alerts_org on public.alerts for all using (org_id = public.current_org_id()) with check (org_id = public.current_org_id());
create policy appts_org on public.appointments for all using (org_id = public.current_org_id()) with check (org_id = public.current_org_id());

-- Seed a couple of demo alerts so the critical-alerts banner has content.
insert into public.alerts (org_id, patient_id, patient_name, initials, avatar_color, type, message, severity)
select '11111111-1111-1111-1111-111111111111', id, first_name || ' ' || last_name, '!!', '#e11d48', 'Critical Lab', 'Potassium 6.2 — critical', 'Critical'
from public.patients where mrn = 'MRN-1001'
on conflict do nothing;
