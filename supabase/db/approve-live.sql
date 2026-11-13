begin;

-- 1. As the verified admin, approve the pending account.
set local role authenticated;
set local request.jwt.claims = '{"sub":"7b2ec287-4c45-4660-896e-45bd7fe5b9b4","role":"authenticated","aud":"authenticated","aal":"aal1","session_id":"go-live-approval-2026-10-26"}';
select public.approve_profile('0cf4097a-8f37-406e-a984-bfb372e1fc9b', 'doctor');

-- 2. Switch to the just-approved account and see what it can now read.
set local role authenticated;
set local request.jwt.claims = '{"sub":"0cf4097a-8f37-406e-a984-bfb372e1fc9b","role":"authenticated","aud":"authenticated","aal":"aal1"}';

select 'approved_profile' as source,
       (select role || ' verified=' || verified::text || ' requested=' || coalesce(requested_role,'null')
          from public.profiles where id = '0cf4097a-8f37-406e-a984-bfb372e1fc9b') as detail
union all
select 'patients_readable_now', cast(count(*) as text) from public.patients
union all
select 'current_org_id', coalesce(cast(public.current_org_id() as text), 'NULL')
union all
select 'auth_events', to_jsonb(a)::text from public.auth_events a
union all
select 'audit_log', to_jsonb(l)::text from public.audit_log l
order by 1;

commit;
