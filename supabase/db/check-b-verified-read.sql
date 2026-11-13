begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a6ccf69e-920e-4a2e-959c-45fcf7110586","role":"authenticated","aud":"authenticated","aal":"aal1"}';
select 'patients_visible' as r, cast((select count(*) from public.patients) as text) as n, coalesce(cast(public.current_org_id() as text),'NULL') as org;
rollback;
