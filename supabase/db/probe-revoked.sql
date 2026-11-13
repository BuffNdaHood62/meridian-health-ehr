begin;
create temp table probe (k text, v text) on commit drop;
grant insert, select on probe to authenticated;

-- the revoked seeded doctor account: password hash unchanged, access gone
set local role authenticated;
select set_config('request.jwt.claims', json_build_object(
  'sub','a6ccf69e-920e-4a2e-959c-45fcf7110586','role','authenticated',
  'aud','authenticated','aal','aal1','email','doctor@www.clinic')::text, true);
insert into probe
select 'revoked_doctor org', coalesce(cast(public.current_org_id() as text), 'NULL')
union all select 'revoked_doctor is_admin', public.is_admin()::text
union all select 'revoked_doctor may_read_patients', public.role_allows('patients','select')::text
union all select 'revoked_doctor patients', cast(count(*) as text) from public.patients;

-- your own account must be unaffected
set local role authenticated;
select set_config('request.jwt.claims', json_build_object(
  'sub','0cf4097a-8f37-406e-a984-bfb372e1fc9b','role','authenticated',
  'aud','authenticated','aal','aal1','email','michaelnnamdi62@gmail.com')::text, true);
insert into probe
select 'michael org', coalesce(cast(public.current_org_id() as text), 'NULL')
union all select 'michael may_write_orders', public.role_allows('orders','insert')::text
union all select 'michael patients', cast(count(*) as text) from public.patients;

reset role;
select k, v from probe order by k;
commit;
