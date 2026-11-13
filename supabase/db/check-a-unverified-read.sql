begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"0cf4097a-8f37-406e-a984-bfb372e1fc9b","role":"authenticated","aud":"authenticated","aal":"aal1"}';
select 'patients_visible' as r, cast((select count(*) from public.patients) as text) as n, coalesce(cast(public.current_org_id() as text),'NULL') as org;
rollback;
