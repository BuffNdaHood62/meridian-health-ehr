begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a6ccf69e-920e-4a2e-959c-45fcf7110586","role":"authenticated","aud":"authenticated","aal":"aal1"}';
insert into public.orders (patient_id,name,type,detail,priority,status,ordered_at) values ((select id from public.patients limit 1),'Test order','Lab','rls probe','Normal','Pending',now());
rollback;
