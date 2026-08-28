-- ============================================================================
-- 0004_role_rls.sql — per-role access + patient columns for full mapping
-- ============================================================================

-- Extra patient columns so the client Patient shape maps 1:1 (no null casts).
alter table public.patients
  add column if not exists emergency_contact jsonb default '{"name":"","relation":"","phone":""}'::jsonb,
  add column if not exists admit_date timestamptz;

-- Per-role entity access. doctor/nurse/admin = full; reception = patients +
-- messages only; lab = patients + labs + orders + messages. Org boundary
-- (current_org_id) still enforced by every policy.
create or replace function public.role_can(p_entity text, p_action text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when (select role from public.profiles where id = auth.uid()) = 'reception'
      then p_entity in ('patients', 'messages')
    when (select role from public.profiles where id = auth.uid()) = 'lab'
      then p_entity in ('patients', 'labs', 'orders', 'messages')
    else true
  end;
$$;

-- Drop the generic org-only policies from 0001 and replace with role-aware ones.
drop policy if exists patients_org on public.patients;
drop policy if exists allergies_org on public.allergies;
drop policy if exists meds_org on public.medications;
drop policy if exists labs_org on public.labs;
drop policy if exists vitals_org on public.vitals;
drop policy if exists history_org on public.history;
drop policy if exists notes_org on public.notes;
drop policy if exists orders_org on public.orders;
drop policy if exists messages_org on public.messages;

create policy patients_rbac on public.patients
  for all using (org_id = public.current_org_id() and public.role_can('patients', 'read'))
  with check (org_id = public.current_org_id() and public.role_can('patients', 'write'));

create policy allergies_rbac on public.allergies
  for all using (
    (select org_id from public.patients p where p.id = patient_id) = public.current_org_id()
    and public.role_can('allergies', 'read'));
create policy meds_rbac on public.medications
  for all using (
    (select org_id from public.patients p where p.id = patient_id) = public.current_org_id()
    and public.role_can('medications', 'read'));
create policy labs_rbac on public.labs
  for all using (
    (select org_id from public.patients p where p.id = patient_id) = public.current_org_id()
    and public.role_can('labs', 'read'));
create policy vitals_rbac on public.vitals
  for all using (
    (select org_id from public.patients p where p.id = patient_id) = public.current_org_id()
    and public.role_can('vitals', 'read'));
create policy history_rbac on public.history
  for all using (
    (select org_id from public.patients p where p.id = patient_id) = public.current_org_id()
    and public.role_can('history', 'read'));
create policy notes_rbac on public.notes
  for all using (
    (select org_id from public.patients p where p.id = patient_id) = public.current_org_id()
    and public.role_can('notes', 'read'));
create policy orders_rbac on public.orders
  for all using (
    (select org_id from public.patients p where p.id = patient_id) = public.current_org_id()
    and public.role_can('orders', 'read'))
  with check (
    (select org_id from public.patients p where p.id = patient_id) = public.current_org_id()
    and public.role_can('orders', 'write'));
create policy messages_rbac on public.messages
  for all using (org_id = public.current_org_id() and public.role_can('messages', 'read'))
  with check (org_id = public.current_org_id() and public.role_can('messages', 'write'));
